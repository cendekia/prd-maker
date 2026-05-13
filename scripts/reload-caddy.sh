#!/usr/bin/env bash
# Re-render the managed PRDMaker block in /etc/caddy/Caddyfile and reload
# Caddy. Idempotent — strips any prior managed block, writes a fresh one
# from deploy/caddy/prdmaker.caddyfile.template using the host from
# NEXT_PUBLIC_APP_URL in .env.local. Doesn't touch Docker.
#
# Use after editing the Caddy template or the public URL.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CADDY_TPL="deploy/caddy/prdmaker.caddyfile.template"
CADDY_TARGET="/etc/caddy/Caddyfile"
MARKER_BEGIN="# >>> prdmaker BEGIN (managed by scripts/prod-docker.sh)"
MARKER_END="# <<< prdmaker END"
ENV_FILE=".env.local"

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

[ -f "$CADDY_TPL" ] || { echo "Missing $CADDY_TPL"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE"; exit 1; }

APP_URL="$(read_env "$ENV_FILE" NEXT_PUBLIC_APP_URL)"
HOST="$(url_host "$APP_URL")"
[ -n "$HOST" ] || { echo "Could not parse host from NEXT_PUBLIC_APP_URL='$APP_URL'"; exit 1; }

rendered="$(sed "s/__HOST__/$HOST/g" "$CADDY_TPL")"

tmp="$(mktemp)"
if [ -f "$CADDY_TARGET" ]; then
  sudo cat "$CADDY_TARGET" > "$tmp"
fi
if grep -qF "$MARKER_BEGIN" "$tmp" 2>/dev/null; then
  echo "Replacing existing managed block in $CADDY_TARGET"
  awk -v b="$MARKER_BEGIN" -v e="$MARKER_END" '
    $0==b {skip=1; next}
    $0==e {skip=0; next}
    !skip {print}
  ' "$tmp" > "${tmp}.stripped"
  mv "${tmp}.stripped" "$tmp"
else
  echo "Appending managed block to $CADDY_TARGET"
fi
{
  awk '/.*/ {a[NR]=$0} END {n=NR; while(n>0 && a[n] ~ /^[[:space:]]*$/) n--; for(i=1;i<=n;i++) print a[i]}' "$tmp"
  echo
  echo "$MARKER_BEGIN"
  echo "$rendered"
  echo "$MARKER_END"
} > "${tmp}.new"

sudo install -m 0644 -o root -g root "${tmp}.new" "$CADDY_TARGET"
rm -f "$tmp" "${tmp}.new"

echo "Validating Caddyfile..."
if ! sudo caddy validate --config "$CADDY_TARGET" --adapter caddyfile >/dev/null 2>&1; then
  echo "Caddy validation failed:"
  sudo caddy validate --config "$CADDY_TARGET" --adapter caddyfile
  exit 1
fi

echo "Reloading Caddy..."
sudo systemctl reload caddy
echo "Done. Tail logs with: sudo journalctl -u caddy -f"
