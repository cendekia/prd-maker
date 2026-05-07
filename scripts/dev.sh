#!/usr/bin/env bash
# Run all PRDMaker services for local testing.
#   - Next.js dev server (port 3000)
#   - Hocuspocus collab server (port 1234)
#
# Both processes stream to this terminal with a [next] / [collab] prefix.
# Press Ctrl-C once to stop everything cleanly.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ---------------------------------------------------------------------------
# Pre-flight checks. We fail fast with a useful message rather than letting
# Next.js or Hocuspocus crash on missing env values.
# ---------------------------------------------------------------------------

require_file() {
  local path="$1" hint="$2"
  if [ ! -f "$path" ]; then
    echo "Missing $path"
    echo "  -> $hint"
    exit 1
  fi
}

require_file ".env.local" "Run: cp .env.example .env.local  (then fill in secrets)"
require_file "apps/collab/.env" "Run: cp apps/collab/.env.example apps/collab/.env  (then fill in secrets)"

if [ ! -d "node_modules" ]; then
  echo "Root node_modules missing — running npm install..."
  npm install --no-audit --no-fund
fi

if [ ! -d "apps/collab/node_modules" ]; then
  echo "apps/collab node_modules missing — installing..."
  (cd apps/collab && npm install --no-audit --no-fund)
fi

# ---------------------------------------------------------------------------
# Process management. We start each service in the background, capture its
# pid, and on shutdown send TERM to the whole process group so Next.js's
# child workers also exit (otherwise port 3000 stays bound).
# ---------------------------------------------------------------------------

pids=()
pgids=()

# Look up the process group id of $1. With `set -m` enabled each backgrounded
# pipeline gets its own pgid, and `kill -- -PGID` then takes out every stage
# of the pipe AND any forked children (next-server, tsx, etc.) in one shot.
pgid_of() {
  ps -o pgid= -p "$1" 2>/dev/null | tr -d ' '
}

cleanup() {
  # Avoid running cleanup twice if both EXIT and INT fire.
  trap - EXIT INT TERM
  echo
  echo "Stopping services..."
  for pgid in "${pgids[@]}"; do
    [ -n "$pgid" ] && kill -TERM -- "-$pgid" 2>/dev/null || true
  done
  # Give them a moment to exit gracefully, then force-kill anything left.
  sleep 1
  for pgid in "${pgids[@]}"; do
    [ -n "$pgid" ] && kill -KILL -- "-$pgid" 2>/dev/null || true
  done
  # Final safety net: nothing should be holding our ports.
  for port in 3000 1234; do
    leftover=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    [ -n "$leftover" ] && kill -KILL $leftover 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

# Prefix each line with the service name. awk's fflush() is portable across
# gawk, mawk, and macOS's BSD awk; sed -u is GNU-only.
prefix() {
  awk -v tag="$1" '{ print "[" tag "] " $0; fflush() }'
}

# Run each service in its own process group via `setsid`-equivalent: bash
# `set -m` enables job control and `&` puts the child in a new pgid.
set -m

(cd apps/collab && npm run dev 2>&1 | prefix "collab") &
pids+=($!)
pgids+=("$(pgid_of $!)")

(npm run dev 2>&1 | prefix "next  ") &
pids+=($!)
pgids+=("$(pgid_of $!)")

set +m

cat <<EOF

PRDMaker dev stack is starting.
  - Next.js:  http://localhost:3000
  - Collab:   ws://localhost:1234

Press Ctrl-C to stop both.

EOF

# Poll for first-to-exit. `wait -n` would be cleaner but it's only in bash
# 4.3+, and macOS still ships bash 3.2. The trap on INT/TERM interrupts
# `sleep`, so Ctrl-C fires cleanup immediately.
while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo
      echo "One service exited — shutting the rest down."
      exit 1
    fi
  done
  sleep 1
done
