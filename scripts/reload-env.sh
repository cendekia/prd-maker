#!/usr/bin/env bash
# Recreate the next + collab containers so they pick up edits to .env.local
# (or apps/collab/.env). For server-only vars (RESEND_API_KEY, AUTH_SECRET,
# DATABASE_URL, COLLAB_SECRET, ENCRYPTION_KEY, Stripe keys, ACME_EMAIL, …)
# this is enough — no image rebuild needed.
#
# If you changed a NEXT_PUBLIC_* var, use scripts/prod-docker.sh instead:
# those are baked into the JS bundle at build time and require a rebuild.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="docker-compose.prod.yml"

if grep -qE '^NEXT_PUBLIC_' .env.local 2>/dev/null; then
  # Warn — but don't block — when NEXT_PUBLIC_* may have been touched.
  echo "Note: NEXT_PUBLIC_* changes need a rebuild via scripts/prod-docker.sh."
  echo "      This script only re-reads server-side env vars."
  echo
fi

echo "Recreating next + collab with fresh env..."
docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps next collab

echo
echo "Recent logs:"
docker compose -f "$COMPOSE_FILE" logs --tail=20 next collab
