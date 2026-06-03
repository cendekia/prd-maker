#!/usr/bin/env bash
# Seamless update deploy for an ALREADY-PROVISIONED PRDMaker host.
#
# Unlike scripts/prod-docker.sh — the first-time provisioner that installs
# Docker, writes the Caddy/nginx config, obtains TLS, opens the firewall, and
# tears the whole stack DOWN before a --no-cache rebuild — this does a fast,
# near zero-downtime code update:
#
#   1. Build the new next/collab images WITH cache while the old containers
#      keep serving.
#   2. Apply pending Prisma migrations against the live DB. Safe as long as
#      migrations are additive/backward-compatible, so the still-running old
#      app keeps working until the swap.
#   3. Recreate ONLY the changed services. Postgres and the edge proxy stay up,
#      so the outage is just the few seconds next/collab take to restart.
#
# Pull your changes first, then deploy:
#   git pull && scripts/deploy.sh
#
# Env toggles:
#   NO_CACHE=1      force a clean --no-cache rebuild
#   SKIP_MIGRATE=1  skip `prisma migrate deploy` (e.g. no schema change)
#
# For infra changes (domain, TLS, proxy, new env vars) re-run prod-docker.sh.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.local"
COLLAB_ENV_FILE="apps/collab/.env"

if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'; C_BLU=$'\033[34m'; C_OFF=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YLW=""; C_BLU=""; C_OFF=""
fi
log()  { echo "${C_BLU}==>${C_OFF} $*"; }
ok()   { echo "${C_GRN}OK${C_OFF}  $*"; }
warn() { echo "${C_YLW}WARN${C_OFF} $*"; }
err()  { echo "${C_RED}ERR${C_OFF} $*" >&2; }

dc() { docker compose -f "$COMPOSE_FILE" "$@"; }

# ---------- preflight ----------
if ! docker compose version >/dev/null 2>&1; then
  err "Docker Compose not available. Provision the host with scripts/prod-docker.sh first."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  err "Docker daemon not reachable from this shell (try: sudo systemctl start docker, or 'newgrp docker')."
  exit 1
fi
for f in "$COMPOSE_FILE" "$ENV_FILE" "$COLLAB_ENV_FILE"; do
  if [ ! -f "$f" ]; then
    err "Missing $f — has this host been provisioned with scripts/prod-docker.sh?"
    exit 1
  fi
done

# Keep the in-Docker nginx edge (if that's how this host is fronted) in the
# active profile set so `up -d` doesn't treat it as an orphan. Host-Caddy
# setups have no such container, so we add nothing.
PROFILE_ARGS=()
if docker ps --format '{{.Names}}' | grep -q '^prdmaker-nginx$'; then
  PROFILE_ARGS=(--profile edge-nginx)
  log "Detected in-Docker nginx edge — keeping the edge-nginx profile active."
fi

build_args=()
[ "${NO_CACHE:-0}" = "1" ] && build_args+=(--no-cache)

START_TS=$(date +%s)

# ---------- 1. Build while the old stack keeps serving ----------
log "Building next + collab images${NO_CACHE:+ (no cache)} ..."
dc "${PROFILE_ARGS[@]}" build "${build_args[@]}" next collab
ok "Images built (old containers still serving)."

# ---------- 2. Migrate the live DB ----------
if [ "${SKIP_MIGRATE:-0}" = "1" ]; then
  warn "SKIP_MIGRATE=1 — not running prisma migrate deploy."
else
  log "Applying database migrations (prisma migrate deploy) ..."
  # One-off container off the freshly built image. --no-deps avoids touching
  # the running postgres; `run` publishes no ports so it can't clash with the
  # live app. If this fails we exit here — the old app stays up, unswapped.
  dc run --rm --no-deps next npx prisma migrate deploy
  ok "Migrations applied (or already up to date)."
fi

# ---------- 3. Recreate only the changed services ----------
log "Recreating app services (postgres + edge proxy stay up) ..."
dc "${PROFILE_ARGS[@]}" up -d next collab
ok "Containers updated."

# ---------- readiness probe ----------
log "Waiting for the app to respond on 127.0.0.1:3000 ..."
ready=0
code=000
for _ in $(seq 1 45); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/ 2>/dev/null || echo 000)
  if [ "$code" != "000" ] && [ "$code" -lt 500 ]; then
    ready=1
    break
  fi
  sleep 2
done

ELAPSED=$(( $(date +%s) - START_TS ))
echo
if [ "$ready" = "1" ]; then
  ok "Deploy complete in ${ELAPSED}s — app responding (HTTP $code)."
else
  warn "App not responding after ~90s (last HTTP code: $code)."
fi

echo
echo "Useful:"
echo "  docker compose -f $COMPOSE_FILE ps"
echo "  docker compose -f $COMPOSE_FILE logs -f next"
echo "  docker compose -f $COMPOSE_FILE logs -f collab"

if [ "$ready" != "1" ]; then
  echo
  echo "Recent next-container logs:"
  dc logs --tail=80 next || true
  exit 1
fi
