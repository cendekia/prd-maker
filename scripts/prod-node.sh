#!/usr/bin/env bash
# Build and run PRDMaker in production mode on a VM.
# - Next.js app on 127.0.0.1:3000
# - Collab server on 127.0.0.1:1234
# - Nginx on port 80 reverse proxies:
#     /         -> 127.0.0.1:3000
#     /collab/  -> 127.0.0.1:1234

set -euo pipefail

PUBLIC_IP="24.199.106.227"
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

# Ensure browser-facing URLs match public IP + Nginx WS route.
if ! rg -q '^NEXT_PUBLIC_APP_URL="http://24\.199\.106\.227"$' .env.local; then
  echo "Expected NEXT_PUBLIC_APP_URL=\"http://${PUBLIC_IP}\" in .env.local"
  exit 1
fi
if ! rg -q '^NEXT_PUBLIC_COLLAB_URL="ws://24\.199\.106\.227/collab"$' .env.local; then
  echo "Expected NEXT_PUBLIC_COLLAB_URL=\"ws://${PUBLIC_IP}/collab\" in .env.local"
  exit 1
fi

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
  listen 80;
  listen [::]:80;
  server_name 24.199.106.227;

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
echo "  App URL:       http://${PUBLIC_IP}"
echo "  Collab via WS: ws://${PUBLIC_IP}/collab"
echo
echo "Logs:"
echo "  tail -f ${LOG_DIR}/next.log"
echo "  tail -f ${LOG_DIR}/collab.log"
