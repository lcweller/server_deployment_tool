#!/usr/bin/env bash
# Steamline agent — one-line install (Linux / macOS / WSL).
# Usage:
#   curl -fsSL "https://<your-dashboard>/install-agent.sh" | bash -s -- "<BASE_URL>" "<ENROLLMENT_TOKEN>"
#
# Requires: curl, bash, Node.js 18+ on PATH.
set -euo pipefail

die() {
  echo "steamline: $*" >&2
  exit 1
}

BASE_URL="${1:-}"
TOKEN="${2:-}"

if [[ -z "$BASE_URL" || -z "$TOKEN" ]]; then
  die 'usage: curl -fsSL "<dashboard>/install-agent.sh" | bash -s -- "<BASE_URL>" "<ENROLLMENT_TOKEN>"'
fi

BASE_URL="${BASE_URL%/}"

if ! command -v curl >/dev/null 2>&1; then
  die "curl is required but not found."
fi

if ! command -v node >/dev/null 2>&1; then
  die "Node.js is required (v18+). Install from https://nodejs.org/ or your package manager."
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if (( NODE_MAJOR < 18 )); then
  die "Node.js 18 or newer is required (found $(node -v))."
fi

INSTALL_ROOT="${STEAMLINE_HOME:-$HOME/.steamline}"
mkdir -p "$INSTALL_ROOT"

AGENT_URL="${BASE_URL}/steamline-agent.cjs"
echo "Downloading agent from ${AGENT_URL} ..." >&2
curl -fsSL "$AGENT_URL" -o "$INSTALL_ROOT/steamline-agent.cjs"
chmod 644 "$INSTALL_ROOT/steamline-agent.cjs" 2>/dev/null || true

TMPJSON="$(mktemp)"
cleanup() {
  rm -f "$TMPJSON"
}
trap cleanup EXIT

set +e
node "$INSTALL_ROOT/steamline-agent.cjs" enroll "$BASE_URL" "$TOKEN" >"$TMPJSON"
RC=$?
set -e
if [[ $RC -ne 0 ]]; then
  die "enrollment failed (exit $RC)"
fi

if ! API_KEY="$(
  node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); if(!j.apiKey) process.exit(1); process.stdout.write(j.apiKey)" "$TMPJSON"
)"; then
  die "could not parse enrollment response"
fi

umask 077
printf 'STEAMLINE_API_KEY=%s\n' "$API_KEY" >"$INSTALL_ROOT/steamline-agent.env"

echo "" >&2
echo "Enrollment saved to $INSTALL_ROOT/steamline-agent.env" >&2
echo "Start the agent (heartbeat + auto-provision from the dashboard):" >&2
echo "  cd $INSTALL_ROOT && node steamline-agent.cjs run \"$BASE_URL\"" >&2
echo "" >&2
