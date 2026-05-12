#!/usr/bin/env bash
# Provision and run the PRDMaker production stack on a single Linux VM
# end-to-end. Designed for a fresh Ubuntu/Debian box — installs Docker if
# missing, validates config, opens the firewall, builds the images, applies
# Prisma migrations on container start, and waits until the app responds.
#
# No host/IP is baked into the script. The public URL is read from
# NEXT_PUBLIC_APP_URL in .env.local — set it to whatever the browser
# will use (IP or domain, http:// or https://) and everything follows.
#
# When NEXT_PUBLIC_APP_URL starts with https://, the script also runs
# certbot once to obtain a Let's Encrypt certificate via the webroot
# challenge, then leaves a certbot sidecar running for auto-renewal.
#
# Usage:
#   ./scripts/prod-docker.sh                  # full rebuild (--no-cache)
#   FAST=1 ./scripts/prod-docker.sh           # cached rebuild
#   STAGING=1 ./scripts/prod-docker.sh        # use Let's Encrypt staging CA
#
# Required env values (.env.local):
#   NEXT_PUBLIC_APP_URL    http(s)://your-host
#   NEXT_PUBLIC_COLLAB_URL ws(s)://your-host/collab
#   AUTH_URL               same as NEXT_PUBLIC_APP_URL
#   DATABASE_URL           postgresql://postgres:postgres@postgres:5432/prdmaker?schema=public
#   AUTH_SECRET            openssl rand -base64 32
#   ENCRYPTION_KEY         openssl rand -hex 32
#   COLLAB_SECRET          openssl rand -hex 32   (must match apps/collab/.env)
#   ACME_EMAIL             only required when NEXT_PUBLIC_APP_URL is https://

set -euo pipefail

# ---------- Configuration ----------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"
NGINX_HTTP_CONF="deploy/nginx/prdmaker-http.conf"
NGINX_HTTPS_TPL="deploy/nginx/prdmaker-https.conf.template"
NGINX_OUT_CONF="deploy/nginx/prdmaker.conf"
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

# ---------- Step 2: env helpers ----------
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
    *)         echo "" ;;
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

# ---------- Step 3: firewall ----------
ensure_firewall() {
  local need_https="$1"
  if ! command -v ufw >/dev/null 2>&1; then
    return
  fi
  if ! sudo ufw status 2>/dev/null | grep -q "Status: active"; then
    return
  fi
  if ! sudo ufw status | grep -qE '^80(/tcp)?\s+ALLOW'; then
    log "Opening port 80 in UFW..."
    sudo ufw allow 80/tcp
  fi
  if [ "$need_https" = "1" ] && ! sudo ufw status | grep -qE '^443(/tcp)?\s+ALLOW'; then
    log "Opening port 443 in UFW..."
    sudo ufw allow 443/tcp
  fi
}

# ---------- Step 4: nginx config rendering ----------
render_nginx_conf() {
  local mode="$1" host="$2"
  if [ "$mode" = "https" ]; then
    log "Rendering HTTPS nginx config for host: $host"
    sed "s/__HOST__/$host/g" "$NGINX_HTTPS_TPL" > "$NGINX_OUT_CONF"
  else
    log "Rendering HTTP nginx config"
    cp "$NGINX_HTTP_CONF" "$NGINX_OUT_CONF"
  fi
}

# ---------- Step 5: cert bootstrap ----------
# certbot won't run unless nginx is up on port 80 to serve the http-01
# challenge, but nginx (in https mode) won't start without cert files.
# Solution: drop self-signed dummy certs at the live/$host/ path so nginx
# boots; then run certbot, which replaces them with the real cert; nginx's
# 6h reload picks the real ones up (or we reload immediately).
ensure_dummy_certs() {
  local host="$1"
  local volname="prdmaker_certbot_certs"
  # Make sure the volume exists (compose creates it on `up`, but we want
  # to seed it before nginx starts).
  docker volume inspect "$volname" >/dev/null 2>&1 || docker volume create "$volname" >/dev/null
  if docker run --rm -v "${volname}:/etc/letsencrypt" alpine sh -c \
    "[ -s /etc/letsencrypt/live/$host/fullchain.pem ] && [ -s /etc/letsencrypt/live/$host/privkey.pem ]" \
    2>/dev/null; then
    return
  fi
  log "Generating self-signed dummy certificate for $host so nginx can boot..."
  docker run --rm -v "${volname}:/etc/letsencrypt" alpine sh -c "
    set -e
    apk add --no-cache openssl >/dev/null
    mkdir -p /etc/letsencrypt/live/$host
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout /etc/letsencrypt/live/$host/privkey.pem \
      -out /etc/letsencrypt/live/$host/fullchain.pem \
      -subj '/CN=$host' >/dev/null 2>&1
  "
}

acquire_real_cert() {
  local host="$1" email="$2"
  local volname="prdmaker_certbot_certs"
  # Detect dummy vs real: the dummy is a self-signed RSA, the real one is
  # issued by Let's Encrypt. We check the issuer string.
  if docker run --rm -v "${volname}:/etc/letsencrypt" alpine sh -c "
    apk add --no-cache openssl >/dev/null 2>&1
    openssl x509 -in /etc/letsencrypt/live/$host/fullchain.pem -noout -issuer 2>/dev/null | grep -q -i 'let.s encrypt'
  "; then
    ok "Real Let's Encrypt cert already present for $host"
    return
  fi

  log "Requesting Let's Encrypt certificate for $host (email: $email)..."

  # Wipe dummy so certbot doesn't refuse / create a -0001 suffix.
  docker run --rm -v "${volname}:/etc/letsencrypt" alpine sh -c \
    "rm -rf /etc/letsencrypt/live/$host /etc/letsencrypt/archive/$host /etc/letsencrypt/renewal/$host.conf"

  local staging_flag=""
  if [ "${STAGING:-0}" = "1" ]; then
    staging_flag="--staging"
    warn "Using Let's Encrypt staging CA (cert will not be trusted by browsers)."
  fi

  # Run certbot via the compose service so it shares the same volumes.
  if ! docker compose -f "$COMPOSE_FILE" run --rm \
      --entrypoint certbot certbot \
      certonly --webroot -w /var/www/certbot \
      -d "$host" \
      --email "$email" --agree-tos --no-eff-email --non-interactive \
      $staging_flag; then
    err "certbot failed. Common causes:"
    err "  - $host does not resolve to this server's public IP"
    err "  - Port 80 isn't reachable from the internet (firewall / security group)"
    err "  - Let's Encrypt rate limit hit (use STAGING=1 for testing)"
    # Re-seed dummy so nginx keeps serving (otherwise it'll crash-loop).
    ensure_dummy_certs "$host"
    docker compose -f "$COMPOSE_FILE" exec nginx nginx -s reload 2>/dev/null || true
    exit 1
  fi

  ok "Certificate issued. Reloading nginx..."
  docker compose -f "$COMPOSE_FILE" exec nginx nginx -s reload
}

# ---------- Run ----------
ensure_docker

log "Verifying required files..."
require_file "$ENV_FILE"        "Copy .env.example -> $ENV_FILE and set production values."
require_file "$COLLAB_ENV_FILE" "Copy apps/collab/.env.example -> $COLLAB_ENV_FILE and set production values."
require_file "$NGINX_HTTP_CONF" "Repo file."
require_file "$NGINX_HTTPS_TPL" "Repo file."
require_file "$COMPOSE_FILE"    "Repo file."

log "Verifying required env values..."
require_env_value "$ENV_FILE" NEXT_PUBLIC_APP_URL    "Set to the URL the browser will hit, e.g. https://prdmaker.example.com"
require_env_value "$ENV_FILE" NEXT_PUBLIC_COLLAB_URL "Set to wss://<same-host>/collab (https) or ws://<same-host>/collab (http)"
require_env_value "$ENV_FILE" AUTH_URL               "Set to the same value as NEXT_PUBLIC_APP_URL"
require_env_value "$ENV_FILE" DATABASE_URL           "postgresql://postgres:postgres@postgres:5432/prdmaker?schema=public for the bundled DB"
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

if [ -z "$PUBLIC_HOST" ] || [ -z "$SCHEME" ]; then
  err "Could not parse scheme/host from NEXT_PUBLIC_APP_URL='$APP_URL' (need http:// or https://)"
  exit 1
fi

# WS scheme must agree with the HTTP scheme.
case "$SCHEME" in
  https)
    case "$WS_URL" in wss://*) ;; *)
      err "NEXT_PUBLIC_APP_URL is https://, so NEXT_PUBLIC_COLLAB_URL must use wss:// — got $WS_URL"
      exit 1 ;;
    esac
    ;;
  http)
    case "$WS_URL" in ws://*) ;; *)
      err "NEXT_PUBLIC_APP_URL is http://, so NEXT_PUBLIC_COLLAB_URL must use ws:// — got $WS_URL"
      exit 1 ;;
    esac
    ;;
esac
if [ "$(url_host "$WS_URL")" != "$PUBLIC_HOST" ]; then
  err "NEXT_PUBLIC_COLLAB_URL host must match NEXT_PUBLIC_APP_URL host"
  exit 1
fi
case "$WS_URL" in
  ws://*/collab|wss://*/collab|ws://*/collab/|wss://*/collab/) ;;
  *) err "NEXT_PUBLIC_COLLAB_URL must end with /collab"; exit 1 ;;
esac
if [ "$AUTH_URL_VAL" != "$APP_URL" ]; then
  warn "AUTH_URL ($AUTH_URL_VAL) doesn't match NEXT_PUBLIC_APP_URL ($APP_URL). Auth.js callback paths may fail."
fi

# Cross-file secret match.
if [ "$(read_env "$ENV_FILE" COLLAB_SECRET)" != "$(read_env "$COLLAB_ENV_FILE" COLLAB_SECRET)" ]; then
  err "COLLAB_SECRET in $ENV_FILE and $COLLAB_ENV_FILE do not match — JWT verification will fail."
  exit 1
fi

NEED_HTTPS=0
if [ "$SCHEME" = "https" ]; then
  NEED_HTTPS=1
  require_env_value "$ENV_FILE" ACME_EMAIL "Email for Let's Encrypt account / expiry notifications."
fi

ok "All preflight checks passed (host: $PUBLIC_HOST, scheme: $SCHEME)"

ensure_firewall "$NEED_HTTPS"

render_nginx_conf "$SCHEME" "$PUBLIC_HOST"

# Pre-seed dummy certs so nginx can boot in HTTPS mode before certbot runs.
if [ "$NEED_HTTPS" = "1" ]; then
  ensure_dummy_certs "$PUBLIC_HOST"
fi

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

# Wait for nginx to start serving so certbot's challenge will succeed.
log "Waiting for nginx to come up..."
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null --max-time 3 "http://localhost"; then
    break
  fi
  sleep 2
done

# First-time cert acquisition.
if [ "$NEED_HTTPS" = "1" ]; then
  acme_email="$(read_env "$ENV_FILE" ACME_EMAIL)"
  acquire_real_cert "$PUBLIC_HOST" "$acme_email"
fi

# Wait for app readiness through the public scheme/port.
log "Waiting for the app to respond on $APP_URL ..."
ready=0
probe_url="http://localhost"
[ "$NEED_HTTPS" = "1" ] && probe_url="https://localhost"
for i in $(seq 1 60); do
  if curl -fsSk -o /dev/null --max-time 5 "$probe_url"; then
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
echo
echo "Useful commands:"
echo "  docker compose -f $COMPOSE_FILE ps"
echo "  docker compose -f $COMPOSE_FILE logs -f next"
echo "  docker compose -f $COMPOSE_FILE logs -f collab"
echo "  docker compose -f $COMPOSE_FILE logs -f nginx"
echo "  docker compose -f $COMPOSE_FILE logs -f certbot"
echo "  docker compose -f $COMPOSE_FILE logs -f postgres"
echo "  docker compose -f $COMPOSE_FILE down                   # stop"
echo "  docker compose -f $COMPOSE_FILE down -v                # stop + wipe DB + certs"

if [ "$ready" != "1" ]; then
  echo
  echo "Recent next-container logs:"
  docker compose -f "$COMPOSE_FILE" logs --tail=80 next || true
  exit 1
fi
