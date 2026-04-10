#!/usr/bin/env bash
# Steamline agent — one-line install (Linux / macOS / WSL).
# Usage:
#   curl -fsSL "https://<your-dashboard>/install-agent.sh" | bash -s -- "<BASE_URL>" "<ENROLLMENT_TOKEN>"
#
# Requires: curl, bash, Node.js 18+ on PATH.
# After enroll, starts the agent in the background (no second SSH session needed).
# Set STEAMLINE_INSTALL_SKIP_RUN=1 to only enroll and write steamline-agent.env.
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

NODE_BIN="$(command -v node)"
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

if [[ "${STEAMLINE_INSTALL_SKIP_RUN:-0}" == "1" ]]; then
  echo "Skipping background agent (STEAMLINE_INSTALL_SKIP_RUN=1)." >&2
  echo "Start manually: cd $INSTALL_ROOT && node steamline-agent.cjs run \"$BASE_URL\"" >&2
  exit 0
fi

PID_FILE="$INSTALL_ROOT/steamline-agent.pid"
LOG_FILE="$INSTALL_ROOT/agent.log"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${OLD_PID:-}" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Steamline agent already running (PID $OLD_PID). Not starting another copy." >&2
    echo "Log: $LOG_FILE" >&2
    exit 0
  fi
fi

echo "Starting Steamline agent in the background (heartbeat + provisioning)…" >&2
cd "$INSTALL_ROOT"
# shellcheck disable=SC2086
nohup "$NODE_BIN" "$INSTALL_ROOT/steamline-agent.cjs" run "$BASE_URL" >>"$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" >"$PID_FILE"
echo "Agent PID $NEW_PID — log: $LOG_FILE" >&2
echo "You can close SSH; the agent keeps running. Manage servers from the Steamline dashboard." >&2
echo "" >&2
