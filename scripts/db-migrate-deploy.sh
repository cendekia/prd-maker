#!/usr/bin/env bash
# Production migration runner (Step 37).
#
# Applies all pending Prisma migrations against the database in $DATABASE_URL
# with `prisma migrate deploy` — the non-interactive, production-safe command:
# it only applies committed migrations, never generates new ones, and never
# prompts about drift.
#
# Used by .github/workflows/deploy.yml. Run by hand against production like:
#
#   DATABASE_URL="postgresql://<direct-non-pooled-neon-url>" scripts/db-migrate-deploy.sh
#
# Use Neon's DIRECT (non-pooled) connection string here, NOT the PgBouncer
# "-pooler" endpoint: migrations run DDL in a session a transaction pooler
# can't hold cleanly. The running app still uses the pooled URL.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "error: DATABASE_URL is not set." >&2
  echo "       Pass the direct (non-pooled) Neon URL, e.g.:" >&2
  echo "       DATABASE_URL=postgresql://... scripts/db-migrate-deploy.sh" >&2
  exit 1
fi

echo "==> Applying Prisma migrations (prisma migrate deploy)"
npx prisma migrate deploy
echo "==> Done."
