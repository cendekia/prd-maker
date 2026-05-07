#!/usr/bin/env bash
# Build and run PRDMaker production stack with Docker Compose.
# Exposes only port 80 via Nginx.

set -euo pipefail

PUBLIC_IP="24.199.106.227"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

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
require_file "deploy/nginx/prdmaker-ip.conf" "This repo file should exist. Re-pull if missing."
require_file "docker-compose.prod.yml" "This repo file should exist. Re-pull if missing."

if ! grep -Eq '^NEXT_PUBLIC_APP_URL="http://24\.199\.106\.227"$' .env.local; then
  echo "Expected NEXT_PUBLIC_APP_URL=\"http://${PUBLIC_IP}\" in .env.local"
  exit 1
fi
if ! grep -Eq '^NEXT_PUBLIC_COLLAB_URL="ws://24\.199\.106\.227/collab"$' .env.local; then
  echo "Expected NEXT_PUBLIC_COLLAB_URL=\"ws://${PUBLIC_IP}/collab\" in .env.local"
  exit 1
fi

echo "Stopping previous production containers (if any)..."
docker compose -f docker-compose.prod.yml down --remove-orphans

echo "Building fresh images..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "Starting production containers..."
docker compose -f docker-compose.prod.yml up -d

echo
echo "Production Docker stack is up."
echo "  App URL:       http://${PUBLIC_IP}"
echo "  Collab via WS: ws://${PUBLIC_IP}/collab"
echo
echo "Useful commands:"
echo "  docker compose -f docker-compose.prod.yml ps"
echo "  docker compose -f docker-compose.prod.yml logs -f next"
echo "  docker compose -f docker-compose.prod.yml logs -f collab"
echo "  docker compose -f docker-compose.prod.yml logs -f nginx"
