#!/usr/bin/env bash
# Provision and run the PRDMaker production stack on a single Linux VM
# end-to-end. Designed for a fresh Ubuntu/Debian box — it will install
# Docker if missing, validate config, open the firewall, build the
# images, apply Prisma migrations on container start, and wait until
# the app is responding on port 80.
#
# No host/IP is baked into the script or the Nginx config. The public
# URL is read from NEXT_PUBLIC_APP_URL in .env.local — set that to
# whatever the browser will use (IP or domain), and everything else
# follows from it.
#
# Usage:
#   ./scripts/prod-docker.sh           # full rebuild (--no-cache)
#   FAST=1 ./scripts/prod-docker.sh    # cached rebuild

set -euo pipefail

# ---------- Configuration ----------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
NGINX_CONF="deploy/nginx/prdmaker-ip.conf"
ENV_FILE=".env.local"
COLLAB_ENV_FILE="apps/collab/.env"

# Colours — only if stdout is a TTY.
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'; C_BLU=$'\033[34m'; C_OFF=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YLW=""; C_BLU=""; C_OFF=""
fi
log()  { echo "${C_BLU}==>${C_OFF} $*"; }
ok()   { echo "${C_GRN}OK${C_OFF}  $*"; }
warn() { echo "${C_YLW}WARN${C_OFF} $*"; }
err()  { echo "${C_RED}ERR${C_OFF} $*" >&2; }

# ---------- Step 1: Docker + Compose ----------
ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker $(docker --version | awk '{print $3}' | tr -d ,) + Compose installed"
    return
  fi

  log "Docker (or Compose plugin) not found — installing..."
  if ! command -v apt-get >/dev/null 2>&1; then
    err "Auto-install only supports Debian/Ubuntu. Install Docker + Compose manually and re-run."
    err "  https://docs.docker.com/engine/install/"
    exit 1
  fi
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      -o /etc/apt/keyrings/docker.asc
    sudo chmod a+r /etc/apt/keyrings/docker.asc
  fi
  local arch codename
  arch="$(dpkg --print-architecture)"
  codename="$(. /etc/os-release && echo "${VERSION_CODENAME:-stable}")"
  echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${codename} stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo systemctl enable --now docker

  if ! id -nG "$USER" | grep -qw docker; then
    sudo usermod -aG docker "$USER"
    warn "Added '$USER' to the docker group. Log out + back in (or run 'newgrp docker') and re-run this script."
    exit 0
  fi
}

# ---------- Step 2: required files ----------
require_file() {
  local path="$1" hint="$2"
  if [ ! -f "$path" ]; then
    err "Missing $path"
    err "  -> $hint"
    exit 1
  fi
}

# ---------- Step 3: env helpers ----------
# Read a KEY=VALUE entry from an env file. Strips surrounding single or
# double quotes. Empty result means "key missing or empty value".
read_env() {
  local file="$1" key="$2"
  awk -F= -v k="$key" '
    $0 ~ "^"k"=" {
      sub("^"k"=", "")
      gsub(/^["\x27]|["\x27]$/, "")
      print
      exit
    }' "$file"
}

require_env_value() {
  local file="$1" key="$2" hint="$3"
  local v
  v="$(read_env "$file" "$key" || true)"
  if [ -z "${v:-}" ]; then
    err "Missing or empty $key in $file"
    err "  -> $hint"
    exit 1
  fi
}

# Parse the host (with optional port) out of an HTTP URL.
# Example: http://example.com:8080/path -> example.com:8080
url_host() {
  local url="$1"
  url="${url#http://}"
  url="${url#https://}"
  url="${url#ws://}"
  url="${url#wss://}"
  printf '%s' "${url%%/*}"
}

# ---------- Step 4: firewall ----------
ensure_firewall() {
  if ! command -v ufw >/dev/null 2>&1; then
    return
  fi
  if ! sudo ufw status 2>/dev/null | grep -q "Status: active"; then
    return
  fi
  if sudo ufw status | grep -qE '^80(/tcp)?\s+ALLOW'; then
    ok "UFW already allows port 80"
    return
  fi
  log "Opening port 80 in UFW..."
  sudo ufw allow 80/tcp
}

# ---------- Run ----------
ensure_docker

log "Verifying required files..."
require_file "$ENV_FILE"        "Copy .env.example -> $ENV_FILE and set production values."
require_file "$COLLAB_ENV_FILE" "Copy apps/collab/.env.example -> $COLLAB_ENV_FILE and set production values."
require_file "$NGINX_CONF"      "Nginx site config should exist in the repo."
require_file "$COMPOSE_FILE"    "Compose file should exist in the repo."

log "Verifying required env values..."
require_env_value "$ENV_FILE" NEXT_PUBLIC_APP_URL    "Set to the URL the browser will hit, e.g. http://<your-ip-or-domain>"
require_env_value "$ENV_FILE" NEXT_PUBLIC_COLLAB_URL "Set to ws://<same-host>/collab (the Nginx WS route)"
require_env_value "$ENV_FILE" AUTH_URL              "Set to the same value as NEXT_PUBLIC_APP_URL"
require_env_value "$ENV_FILE" DATABASE_URL          "Set to postgresql://postgres:postgres@postgres:5432/prdmaker?schema=public for in-network Postgres, or your external DB URL."
require_env_value "$ENV_FILE" AUTH_SECRET           "Generate with: openssl rand -base64 32"
require_env_value "$ENV_FILE" ENCRYPTION_KEY        "Generate with: openssl rand -hex 32"
require_env_value "$ENV_FILE" COLLAB_SECRET         "Generate with: openssl rand -hex 32 (must match apps/collab/.env)"

require_env_value "$COLLAB_ENV_FILE" DATABASE_URL  "Set to the same DB URL as Next.js (postgres in-network)."
require_env_value "$COLLAB_ENV_FILE" COLLAB_SECRET "Must match COLLAB_SECRET in $ENV_FILE."

# Public host is whatever the user put in NEXT_PUBLIC_APP_URL — IP or domain.
APP_URL="$(read_env "$ENV_FILE" NEXT_PUBLIC_APP_URL)"
WS_URL="$(read_env "$ENV_FILE" NEXT_PUBLIC_COLLAB_URL)"
AUTH_URL="$(read_env "$ENV_FILE" AUTH_URL)"
PUBLIC_HOST="$(url_host "$APP_URL")"

if [ -z "$PUBLIC_HOST" ]; then
  err "Could not parse a host out of NEXT_PUBLIC_APP_URL='$APP_URL'"
  exit 1
fi

# Cross-checks between values that must agree for auth + collab to work.
EXPECTED_WS_HOST="$(url_host "$WS_URL")"
if [ "$EXPECTED_WS_HOST" != "$PUBLIC_HOST" ]; then
  err "NEXT_PUBLIC_COLLAB_URL host '$EXPECTED_WS_HOST' must match NEXT_PUBLIC_APP_URL host '$PUBLIC_HOST'"
  exit 1
fi
case "$WS_URL" in
  ws://*/collab|wss://*/collab|ws://*/collab/|wss://*/collab/) ;;
  *)
    err "NEXT_PUBLIC_COLLAB_URL must end with /collab (the Nginx WebSocket route). Got: $WS_URL"
    exit 1
    ;;
esac
if [ "$AUTH_URL" != "$APP_URL" ]; then
  warn "AUTH_URL ($AUTH_URL) doesn't match NEXT_PUBLIC_APP_URL ($APP_URL). Auth.js callback paths may fail."
fi

# COLLAB_SECRET must match across both env files — the collab server verifies
# JWTs minted by Next.js with this key.
NEXT_SECRET="$(read_env "$ENV_FILE" COLLAB_SECRET)"
COLLAB_SECRET_VAL="$(read_env "$COLLAB_ENV_FILE" COLLAB_SECRET)"
if [ "$NEXT_SECRET" != "$COLLAB_SECRET_VAL" ]; then
  err "COLLAB_SECRET in $ENV_FILE and $COLLAB_ENV_FILE do not match — JWT verification will fail."
  exit 1
fi

ok "All preflight checks passed (public host: $PUBLIC_HOST)"

ensure_firewall

log "Stopping any previous production containers..."
docker compose -f "$COMPOSE_FILE" down --remove-orphans

if [ "${FAST:-0}" = "1" ]; then
  log "Building images (cached)..."
  docker compose -f "$COMPOSE_FILE" build
else
  log "Building images (--no-cache)..."
  docker compose -f "$COMPOSE_FILE" build --no-cache
fi

log "Starting stack..."
docker compose -f "$COMPOSE_FILE" up -d

log "Waiting for the app to respond on http://localhost ..."
ready=0
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null --max-time 3 "http://localhost"; then
    ready=1
    break
  fi
  sleep 2
done

echo
if [ "$ready" = "1" ]; then
  ok "Production stack is up"
else
  warn "App didn't respond within 120s — check logs below."
fi

echo
echo "  ${C_GRN}App URL:${C_OFF}        $APP_URL"
echo "  ${C_GRN}Collab WS:${C_OFF}      $WS_URL"
echo
echo "Useful commands:"
echo "  docker compose -f $COMPOSE_FILE ps"
echo "  docker compose -f $COMPOSE_FILE logs -f next"
echo "  docker compose -f $COMPOSE_FILE logs -f collab"
echo "  docker compose -f $COMPOSE_FILE logs -f nginx"
echo "  docker compose -f $COMPOSE_FILE logs -f postgres"
echo "  docker compose -f $COMPOSE_FILE down                   # stop"
echo "  docker compose -f $COMPOSE_FILE down -v                # stop + wipe DB"

if [ "$ready" != "1" ]; then
  echo
  echo "Recent next-container logs:"
  docker compose -f "$COMPOSE_FILE" logs --tail=80 next || true
  exit 1
fi
