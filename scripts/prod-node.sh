#!/usr/bin/env bash
# Build and run PRDMaker in production mode on a VM.
# - Next.js app on 127.0.0.1:3000
# - Collab server on 127.0.0.1:1234
# - Nginx on port 80 reverse proxies:
#     /         -> 127.0.0.1:3000
#     /collab/  -> 127.0.0.1:1234

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_DIR=".run"
LOG_DIR="logs"
mkdir -p "$RUN_DIR" "$LOG_DIR"

require_file() {
  local path="$1" hint="$2"
  if [ ! -f "$path" ]; then
    echo "Missing $path"
    echo "  -> $hint"
    exit 1
  fi
}

require_file ".env.local" "Copy .env.example -> .env.local and set production values."
require_file "apps/collab/.env" "Copy apps/collab/.env.example -> apps/collab/.env and set production values."

load_env_file() {
  local path="$1"
  # Export all variables defined in the env file so child commands
  # (Prisma/Next.js) can resolve DATABASE_URL and other required keys.
  set -a
  # shellcheck disable=SC1090
  . "$path"
  set +a
}

load_env_file ".env.local"
# Never trust NODE_ENV from local templates for production deploy.
export NODE_ENV=production

# Public host is derived from NEXT_PUBLIC_APP_URL — no hardcoded IP.
read_env() {
  awk -F= -v k="$2" '
    $0 ~ "^"k"=" {
      sub("^"k"=", "")
      gsub(/^["\x27]|["\x27]$/, "")
      print
      exit
    }' "$1"
}
url_host() {
  local u="$1"
  u="${u#http://}"; u="${u#https://}"; u="${u#ws://}"; u="${u#wss://}"
  printf '%s' "${u%%/*}"
}
APP_URL="$(read_env .env.local NEXT_PUBLIC_APP_URL)"
WS_URL="$(read_env .env.local NEXT_PUBLIC_COLLAB_URL)"
PUBLIC_HOST="$(url_host "$APP_URL")"
if [ -z "$PUBLIC_HOST" ]; then
  echo "Could not parse host from NEXT_PUBLIC_APP_URL='$APP_URL' in .env.local"
  exit 1
fi
if [ "$(url_host "$WS_URL")" != "$PUBLIC_HOST" ]; then
  echo "NEXT_PUBLIC_COLLAB_URL host must match NEXT_PUBLIC_APP_URL host. Got WS='$WS_URL', APP='$APP_URL'"
  exit 1
fi
case "$WS_URL" in
  ws://*/collab|wss://*/collab|ws://*/collab/|wss://*/collab/) ;;
  *)
    echo "NEXT_PUBLIC_COLLAB_URL must end with /collab. Got: $WS_URL"
    exit 1
    ;;
esac

if [ ! -d "node_modules" ]; then
  echo "Installing root dependencies..."
  npm install --no-audit --no-fund
fi
if [ ! -d "apps/collab/node_modules" ]; then
  echo "Installing collab dependencies..."
  (cd apps/collab && npm install --no-audit --no-fund)
fi

echo "Building collab server..."
(cd apps/collab && npm run build)

echo "Building Next.js app..."
npm run build

echo "Applying Prisma migrations..."
npm run db:deploy

NGINX_CONF_CONTENT="$(cat <<'EOF'
server {
  listen 80 default_server;
  listen [::]:80 default_server;
  # Catch-all — the host is whatever resolves to this box (IP or domain).
  server_name _;

  client_max_body_size 20m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  location /collab/ {
    proxy_pass http://127.0.0.1:1234/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600;
  }
}
EOF
)"

TMP_CONF="${RUN_DIR}/prdmaker.nginx.conf"
echo "$NGINX_CONF_CONTENT" > "$TMP_CONF"

if [ -d /etc/nginx/sites-available ]; then
  echo "Installing Nginx site config (Debian/Ubuntu layout)..."
  sudo cp "$TMP_CONF" /etc/nginx/sites-available/prdmaker.conf
  sudo ln -sfn /etc/nginx/sites-available/prdmaker.conf /etc/nginx/sites-enabled/prdmaker.conf
  if [ -f /etc/nginx/sites-enabled/default ]; then
    sudo rm -f /etc/nginx/sites-enabled/default
  fi
else
  echo "Installing Nginx conf.d config..."
  sudo cp "$TMP_CONF" /etc/nginx/conf.d/prdmaker.conf
fi

sudo nginx -t
sudo systemctl reload nginx || sudo nginx -s reload

stop_if_running() {
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file" || true)"
    if [ -n "${pid:-}" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pid_file"
  fi
}

stop_if_running "${RUN_DIR}/collab.pid"
stop_if_running "${RUN_DIR}/next.pid"

echo "Starting collab server..."
(cd apps/collab && nohup env PORT=1234 npm run start > "${ROOT_DIR}/${LOG_DIR}/collab.log" 2>&1 & echo $! > "${ROOT_DIR}/${RUN_DIR}/collab.pid")

echo "Starting Next.js server..."
nohup npm run start -- --hostname 127.0.0.1 --port 3000 > "${LOG_DIR}/next.log" 2>&1 & echo $! > "${RUN_DIR}/next.pid"

echo
echo "Production stack is up."
echo "  App URL:       $APP_URL"
echo "  Collab via WS: $WS_URL"
echo
echo "Logs:"
echo "  tail -f ${LOG_DIR}/next.log"
echo "  tail -f ${LOG_DIR}/collab.log"
