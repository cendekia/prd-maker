#!/usr/bin/env bash
# Provision and run the PRDMaker production stack on a single Linux VM
# end-to-end. Designed for a fresh Ubuntu/Debian box.
#
# Two edge-proxy modes are supported. The script picks one automatically;
# override with `EDGE=caddy` or `EDGE=nginx`.
#
#   1. Caddy (auto-selected when caddy is installed):
#      - Host Caddy fronts the stack and manages TLS automatically.
#      - The script appends a managed `__HOST__ { ... }` block to
#        /etc/caddy/Caddyfile (idempotent via markers) and reloads Caddy.
#      - Docker exposes next on 127.0.0.1:3000 and collab on 127.0.0.1:1234.
#
#   2. nginx + certbot (fallback, fully self-contained inside Docker):
#      - Docker nginx binds host :80/:443 directly.
#      - Certbot runs once on first deploy to acquire a Let's Encrypt cert,
#        then a sidecar renews every 12h.
#
# Other env vars:
#   FAST=1     skip --no-cache rebuild
#   STAGING=1  use Let's Encrypt staging CA (nginx mode only)

set -euo pipefail

# ---------- Configuration ----------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
NGINX_HTTP_CONF="deploy/nginx/prdmaker-http.conf"
NGINX_HTTPS_TPL="deploy/nginx/prdmaker-https.conf.template"
NGINX_OUT_CONF="deploy/nginx/prdmaker.conf"
CADDY_TPL="deploy/caddy/prdmaker.caddyfile.template"
CADDY_TARGET="/etc/caddy/Caddyfile"
CADDY_MARKER_BEGIN="# >>> prdmaker BEGIN (managed by scripts/prod-docker.sh)"
CADDY_MARKER_END="# <<< prdmaker END"
ENV_FILE=".env.local"
COLLAB_ENV_FILE="apps/collab/.env"

# Colours.
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'; C_BLU=$'\033[34m'; C_OFF=$'\033[0m'
else
  C_RED=""; C_GRN=""; C_YLW=""; C_BLU=""; C_OFF=""
fi
log()  { echo "${C_BLU}==>${C_OFF} $*"; }
ok()   { echo "${C_GRN}OK${C_OFF}  $*"; }
warn() { echo "${C_YLW}WARN${C_OFF} $*"; }
err()  { echo "${C_RED}ERR${C_OFF} $*" >&2; }

# ---------- Docker ----------
probe_docker_daemon() {
  docker info >/dev/null 2>&1
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker $(docker --version | awk '{print $3}' | tr -d ,) + Compose installed"
    if probe_docker_daemon; then
      ok "Docker daemon reachable"
      return
    fi
    warn "Docker daemon not reachable from this shell."
    if command -v systemctl >/dev/null 2>&1 && ! systemctl is-active --quiet docker; then
      log "Starting docker.service..."
      sudo systemctl enable --now docker || true
      sleep 1
      if probe_docker_daemon; then ok "Docker daemon reachable"; return; fi
    fi
    if id -nG "$USER" 2>/dev/null | grep -qw docker; then
      warn "You're in the 'docker' group but this shell hasn't picked it up — log out + back in, or run: newgrp docker"
    else
      log "Adding $USER to the docker group..."
      sudo usermod -aG docker "$USER"
      warn "Group added. Log out + back in (or run 'newgrp docker'), then re-run."
    fi
    err "Aborting until the daemon is reachable."
    exit 1
  fi

  log "Docker (or Compose plugin) not found — installing..."
  if ! command -v apt-get >/dev/null 2>&1; then
    err "Auto-install only supports Debian/Ubuntu."
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
    warn "Added '$USER' to the docker group. Log out + back in (or run 'newgrp docker') and re-run."
    exit 0
  fi
}

# ---------- env helpers ----------
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
url_host() {
  local u="$1"
  u="${u#http://}"; u="${u#https://}"; u="${u#ws://}"; u="${u#wss://}"
  printf '%s' "${u%%/*}"
}
url_scheme() {
  case "$1" in
    https://*) echo https ;;
    http://*)  echo http  ;;
    *) echo "" ;;
  esac
}
require_file() {
  local path="$1" hint="$2"
  if [ ! -f "$path" ]; then
    err "Missing $path"
    err "  -> $hint"
    exit 1
  fi
}

# ---------- Host port preflight (nginx mode only) ----------
host_port_in_use() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    sudo ss -tlnH "( sport = :${port} )" 2>/dev/null | head -n1 | grep -q .
  elif command -v lsof >/dev/null 2>&1; then
    sudo lsof -nP -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null | tail -n +2 | head -n1 | grep -q .
  else
    return 1
  fi
}
docker_owns_port() {
  local port="$1"
  if ! command -v ss >/dev/null 2>&1; then return 1; fi
  local pid
  pid="$(sudo ss -tlnpH "( sport = :${port} )" 2>/dev/null | grep -oE 'pid=[0-9]+' | head -n1 | cut -d= -f2)"
  [ -n "${pid:-}" ] || return 1
  local proc
  proc="$(ps -p "$pid" -o comm= 2>/dev/null || true)"
  case "$proc" in docker-proxy|docker|dockerd) return 0 ;; *) return 1 ;; esac
}
free_port_or_die() {
  local port="$1"
  if ! host_port_in_use "$port"; then return 0; fi
  if docker_owns_port "$port"; then return 0; fi
  err "Port ${port} is already in use on the host."
  if command -v ss >/dev/null 2>&1; then
    sudo ss -tlnpH "( sport = :${port} )" 2>/dev/null | sed 's/^/  /' >&2
  fi
  err "Stop the other listener (e.g. 'sudo systemctl stop nginx' or 'sudo systemctl stop caddy') and re-run."
  exit 1
}

# ---------- Firewall ----------
ensure_firewall() {
  local open_443="$1"
  if ! command -v ufw >/dev/null 2>&1; then return; fi
  if ! sudo ufw status 2>/dev/null | grep -q "Status: active"; then return; fi
  if ! sudo ufw status | grep -qE '^80(/tcp)?\s+ALLOW'; then
    log "Opening port 80 in UFW..."
    sudo ufw allow 80/tcp
  fi
  if [ "$open_443" = "1" ] && ! sudo ufw status | grep -qE '^443(/tcp)?\s+ALLOW'; then
    log "Opening port 443 in UFW..."
    sudo ufw allow 443/tcp
  fi
}

# ---------- Nginx mode helpers ----------
render_nginx_conf() {
  local scheme="$1" host="$2"
  if [ "$scheme" = "https" ]; then
    log "Rendering HTTPS nginx config for host: $host"
    sed "s/__HOST__/$host/g" "$NGINX_HTTPS_TPL" > "$NGINX_OUT_CONF"
  else
    log "Rendering HTTP nginx config"
    cp "$NGINX_HTTP_CONF" "$NGINX_OUT_CONF"
  fi
}
ensure_dummy_certs() {
  local host="$1" vol="prd-maker_certbot_certs"
  docker volume inspect "$vol" >/dev/null 2>&1 || docker volume create "$vol" >/dev/null
  if docker run --rm -v "${vol}:/etc/letsencrypt" alpine sh -c \
    "[ -s /etc/letsencrypt/live/$host/fullchain.pem ] && [ -s /etc/letsencrypt/live/$host/privkey.pem ]" \
    2>/dev/null; then return; fi
  log "Generating self-signed dummy certificate for $host so nginx can boot..."
  docker run --rm -v "${vol}:/etc/letsencrypt" alpine sh -c "
    apk add --no-cache openssl >/dev/null
    mkdir -p /etc/letsencrypt/live/$host
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout /etc/letsencrypt/live/$host/privkey.pem \
      -out /etc/letsencrypt/live/$host/fullchain.pem \
      -subj '/CN=$host' >/dev/null 2>&1
  "
}
acquire_real_cert() {
  local host="$1" email="$2" vol="prd-maker_certbot_certs"
  if docker run --rm -v "${vol}:/etc/letsencrypt" alpine sh -c "
    apk add --no-cache openssl >/dev/null 2>&1
    openssl x509 -in /etc/letsencrypt/live/$host/fullchain.pem -noout -issuer 2>/dev/null | grep -q -i 'let.s encrypt'
  "; then
    ok "Real Let's Encrypt cert already present for $host"
    return
  fi
  log "Requesting Let's Encrypt certificate for $host (email: $email)..."
  docker run --rm -v "${vol}:/etc/letsencrypt" alpine sh -c \
    "rm -rf /etc/letsencrypt/live/$host /etc/letsencrypt/archive/$host /etc/letsencrypt/renewal/$host.conf"
  local staging=""
  [ "${STAGING:-0}" = "1" ] && staging="--staging" && warn "Using Let's Encrypt staging CA."
  if ! docker compose -f "$COMPOSE_FILE" --profile edge-nginx run --rm \
      --entrypoint certbot certbot \
      certonly --webroot -w /var/www/certbot \
      -d "$host" --email "$email" --agree-tos --no-eff-email --non-interactive $staging; then
    err "certbot failed (DNS not pointing here? Port 80 blocked? Rate-limit?)."
    ensure_dummy_certs "$host"
    docker compose -f "$COMPOSE_FILE" --profile edge-nginx exec nginx nginx -s reload 2>/dev/null || true
    exit 1
  fi
  ok "Certificate issued. Reloading nginx..."
  docker compose -f "$COMPOSE_FILE" --profile edge-nginx exec nginx nginx -s reload
}

# ---------- Caddy mode helpers ----------
caddy_running() {
  command -v caddy >/dev/null 2>&1 && {
    command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet caddy
  }
}

install_caddy_block() {
  local host="$1"
  require_file "$CADDY_TPL" "Repo file."

  local rendered
  rendered="$(sed "s/__HOST__/$host/g" "$CADDY_TPL")"

  # Idempotent install: strip any existing managed block, then append fresh.
  local tmp
  tmp="$(mktemp)"
  if [ -f "$CADDY_TARGET" ]; then
    sudo cat "$CADDY_TARGET" > "$tmp"
  fi
  if grep -qF "$CADDY_MARKER_BEGIN" "$tmp" 2>/dev/null; then
    log "Replacing existing managed block in $CADDY_TARGET"
    # Delete lines from BEGIN marker through END marker (inclusive).
    awk -v b="$CADDY_MARKER_BEGIN" -v e="$CADDY_MARKER_END" '
      $0==b {skip=1; next}
      $0==e {skip=0; next}
      !skip {print}
    ' "$tmp" > "${tmp}.stripped"
    mv "${tmp}.stripped" "$tmp"
  else
    log "Appending managed block to $CADDY_TARGET"
  fi

  # Trim trailing blank lines and append the new block.
  {
    awk '/.*/ {a[NR]=$0} END {n=NR; while(n>0 && a[n] ~ /^[[:space:]]*$/) n--; for(i=1;i<=n;i++) print a[i]}' "$tmp"
    echo
    echo "$CADDY_MARKER_BEGIN"
    echo "$rendered"
    echo "$CADDY_MARKER_END"
  } > "${tmp}.new"

  sudo install -m 0644 -o root -g root "${tmp}.new" "$CADDY_TARGET"
  rm -f "$tmp" "${tmp}.new"

  log "Validating Caddyfile..."
  if ! sudo caddy validate --config "$CADDY_TARGET" --adapter caddyfile >/dev/null 2>&1; then
    err "Caddy validation failed:"
    sudo caddy validate --config "$CADDY_TARGET" --adapter caddyfile 2>&1 | sed 's/^/  /'
    exit 1
  fi

  log "Reloading Caddy..."
  sudo systemctl reload caddy
  ok "Caddy reloaded — TLS will be issued on first request to https://$host"
}

# ---------- Mode selection ----------
select_edge_mode() {
  case "${EDGE:-}" in
    caddy|nginx) echo "$EDGE"; return ;;
  esac
  if caddy_running; then
    echo caddy
  else
    echo nginx
  fi
}

# ============================================================
# Run
# ============================================================
ensure_docker

log "Verifying required files..."
require_file "$ENV_FILE"        "Copy .env.example -> $ENV_FILE and set production values."
require_file "$COLLAB_ENV_FILE" "Copy apps/collab/.env.example -> $COLLAB_ENV_FILE and set production values."
require_file "$COMPOSE_FILE"    "Repo file."

log "Verifying required env values..."
require_env_value "$ENV_FILE" NEXT_PUBLIC_APP_URL    "e.g. https://prdmaker.example.com"
require_env_value "$ENV_FILE" NEXT_PUBLIC_COLLAB_URL "wss://<same-host>/collab (https) or ws://<same-host>/collab"
require_env_value "$ENV_FILE" AUTH_URL               "Same as NEXT_PUBLIC_APP_URL"
require_env_value "$ENV_FILE" DATABASE_URL           "postgresql://postgres:postgres@postgres:5432/prdmaker?schema=public for bundled DB"
require_env_value "$ENV_FILE" AUTH_SECRET            "openssl rand -base64 32"
require_env_value "$ENV_FILE" ENCRYPTION_KEY         "openssl rand -hex 32"
require_env_value "$ENV_FILE" COLLAB_SECRET          "openssl rand -hex 32 (must match apps/collab/.env)"
require_env_value "$COLLAB_ENV_FILE" DATABASE_URL  "Same DB URL as Next.js."
require_env_value "$COLLAB_ENV_FILE" COLLAB_SECRET "Must match COLLAB_SECRET in $ENV_FILE."

APP_URL="$(read_env "$ENV_FILE" NEXT_PUBLIC_APP_URL)"
WS_URL="$(read_env "$ENV_FILE" NEXT_PUBLIC_COLLAB_URL)"
AUTH_URL_VAL="$(read_env "$ENV_FILE" AUTH_URL)"
PUBLIC_HOST="$(url_host "$APP_URL")"
SCHEME="$(url_scheme "$APP_URL")"
[ -z "$PUBLIC_HOST" ] || [ -z "$SCHEME" ] && { err "Bad NEXT_PUBLIC_APP_URL='$APP_URL'"; exit 1; }

# Scheme consistency.
case "$SCHEME" in
  https) [[ "$WS_URL" == wss://* ]] || { err "NEXT_PUBLIC_COLLAB_URL must be wss:// when app is https://"; exit 1; } ;;
  http)  [[ "$WS_URL" == ws://*  ]] || { err "NEXT_PUBLIC_COLLAB_URL must be ws:// when app is http://"; exit 1; } ;;
esac
[ "$(url_host "$WS_URL")" = "$PUBLIC_HOST" ] || { err "WS host must match APP host"; exit 1; }
case "$WS_URL" in
  ws://*/collab|wss://*/collab|ws://*/collab/|wss://*/collab/) ;;
  *) err "NEXT_PUBLIC_COLLAB_URL must end with /collab"; exit 1 ;;
esac
[ "$AUTH_URL_VAL" = "$APP_URL" ] || warn "AUTH_URL doesn't match NEXT_PUBLIC_APP_URL — auth callbacks may fail."
[ "$(read_env "$ENV_FILE" COLLAB_SECRET)" = "$(read_env "$COLLAB_ENV_FILE" COLLAB_SECRET)" ] \
  || { err "COLLAB_SECRET mismatch between $ENV_FILE and $COLLAB_ENV_FILE"; exit 1; }

# Decide edge mode.
EDGE_MODE="$(select_edge_mode)"
log "Edge mode: $EDGE_MODE"

NEED_HTTPS=0; [ "$SCHEME" = "https" ] && NEED_HTTPS=1

if [ "$EDGE_MODE" = "nginx" ] && [ "$NEED_HTTPS" = "1" ]; then
  require_env_value "$ENV_FILE" ACME_EMAIL "Email for Let's Encrypt account."
fi

ok "Preflight checks passed (host: $PUBLIC_HOST, scheme: $SCHEME)"

# Firewall: only opens 443 when WE'RE binding it. Caddy is already on 80/443
# and the user's firewall presumably already allows those.
if [ "$EDGE_MODE" = "nginx" ]; then
  ensure_firewall "$NEED_HTTPS"
fi

log "Stopping any previous production containers..."
if [ "$EDGE_MODE" = "nginx" ]; then
  docker compose -f "$COMPOSE_FILE" --profile edge-nginx down --remove-orphans
else
  docker compose -f "$COMPOSE_FILE" down --remove-orphans
fi

# Port preflight only applies when we're the one binding 80/443.
if [ "$EDGE_MODE" = "nginx" ]; then
  log "Checking host port availability..."
  free_port_or_die 80
  [ "$NEED_HTTPS" = "1" ] && free_port_or_die 443
fi

# Render nginx config and seed dummy certs if we're using nginx mode.
if [ "$EDGE_MODE" = "nginx" ]; then
  render_nginx_conf "$SCHEME" "$PUBLIC_HOST"
  [ "$NEED_HTTPS" = "1" ] && ensure_dummy_certs "$PUBLIC_HOST"
fi

# Build.
build_args=()
[ "${FAST:-0}" = "1" ] || build_args+=(--no-cache)
if [ "$EDGE_MODE" = "nginx" ]; then
  log "Building images (${build_args[*]:-cached})..."
  docker compose -f "$COMPOSE_FILE" --profile edge-nginx build "${build_args[@]}"
  log "Starting stack..."
  docker compose -f "$COMPOSE_FILE" --profile edge-nginx up -d
else
  log "Building images (${build_args[*]:-cached})..."
  docker compose -f "$COMPOSE_FILE" build "${build_args[@]}"
  log "Starting stack..."
  docker compose -f "$COMPOSE_FILE" up -d
fi

# In Caddy mode, wire up the host Caddy AFTER containers are up so the
# reload doesn't briefly 502 the user.
if [ "$EDGE_MODE" = "caddy" ]; then
  install_caddy_block "$PUBLIC_HOST"
fi

# In nginx-https mode, run certbot once.
if [ "$EDGE_MODE" = "nginx" ] && [ "$NEED_HTTPS" = "1" ]; then
  log "Waiting for nginx to come up..."
  for i in $(seq 1 30); do
    curl -fsS -o /dev/null --max-time 3 "http://localhost" && break
    sleep 2
  done
  acme_email="$(read_env "$ENV_FILE" ACME_EMAIL)"
  acquire_real_cert "$PUBLIC_HOST" "$acme_email"
fi

# Probe app readiness.
log "Waiting for the app to respond on $APP_URL ..."
ready=0
for i in $(seq 1 60); do
  if curl -fsSk -o /dev/null --max-time 5 -H "Host: $PUBLIC_HOST" \
       "http://127.0.0.1:3000" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 2
done

echo
if [ "$ready" = "1" ]; then
  ok "Production stack is up"
else
  warn "App didn't respond within ~120s — check logs below."
fi

echo
echo "  ${C_GRN}App URL:${C_OFF}        $APP_URL"
echo "  ${C_GRN}Collab WS:${C_OFF}      $WS_URL"
echo "  ${C_GRN}Edge mode:${C_OFF}      $EDGE_MODE"
echo
echo "Useful commands:"
echo "  docker compose -f $COMPOSE_FILE ps"
echo "  docker compose -f $COMPOSE_FILE logs -f next"
echo "  docker compose -f $COMPOSE_FILE logs -f collab"
echo "  docker compose -f $COMPOSE_FILE logs -f postgres"
if [ "$EDGE_MODE" = "caddy" ]; then
  echo "  sudo journalctl -u caddy -f             # Caddy logs (TLS + proxy)"
  echo "  sudo systemctl reload caddy             # reload after editing Caddyfile"
else
  echo "  docker compose -f $COMPOSE_FILE --profile edge-nginx logs -f nginx"
  echo "  docker compose -f $COMPOSE_FILE --profile edge-nginx logs -f certbot"
fi
echo "  docker compose -f $COMPOSE_FILE down                   # stop"
echo "  docker compose -f $COMPOSE_FILE down -v                # stop + wipe DB"

if [ "$ready" != "1" ]; then
  echo
  echo "Recent next-container logs:"
  docker compose -f "$COMPOSE_FILE" logs --tail=80 next || true
  exit 1
fi
