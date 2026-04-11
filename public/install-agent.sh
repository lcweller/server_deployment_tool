#!/usr/bin/env bash
# Steamline agent — one-line install (Linux / macOS / WSL).
# Usage (hosted Steamline — customers use your public URL, e.g.):
#   curl -fsSL "https://game.layeroneconstultants.com/install-agent.sh" | bash -s -- "https://game.layeroneconstultants.com" "<ENROLLMENT_TOKEN>"
#
# Requires: curl, bash, Node.js 18+ on PATH.
# After enroll, starts the agent in the background (no second SSH session needed).
# Set STEAMLINE_INSTALL_SKIP_RUN=1 to only enroll and write steamline-agent.env.
#
# Minimal Ubuntu: run with sudo so dependencies can be installed, or set STEAMLINE_APT_INSTALL=1.
# Set STEAMLINE_SKIP_APT=1 to never run apt/apk.
# Set STEAMLINE_ALLOW_DUPLICATE_ENROLL=1 to bypass the "already installed" guard (not recommended).
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

INSTALL_ROOT="${STEAMLINE_HOME:-$HOME/.steamline}"
mkdir -p "$INSTALL_ROOT"

# --- One agent per OS instance: refuse if a previous enroll left an API key here ---
if [[ -f "$INSTALL_ROOT/steamline-agent.env" ]]; then
  if grep -qE '^STEAMLINE_API_KEY=[^[:space:]]+' "$INSTALL_ROOT/steamline-agent.env" 2>/dev/null; then
    if [[ "${STEAMLINE_ALLOW_DUPLICATE_ENROLL:-0}" != "1" ]]; then
      die "Agent already installed ($INSTALL_ROOT/steamline-agent.env). One Steamline agent per machine — use the dashboard to deploy multiple game servers to this host. To replace enrollment: remove the host in the dashboard, delete $INSTALL_ROOT, add a new host, and run this installer again. Override (unsafe): STEAMLINE_ALLOW_DUPLICATE_ENROLL=1"
    fi
  fi
fi

# --- Debian/Ubuntu: bash, curl, ca-certificates, tar, 32-bit libs for Valve SteamCMD ---
steamline_try_apt_bootstrap() {
  [[ "$(uname -s)" == "Linux" ]] || return 0
  [[ "${STEAMLINE_SKIP_APT:-0}" == "1" ]] && return 0
  [[ -x /usr/bin/apt-get ]] || return 0

  if [[ "$(id -u)" != "0" ]] && [[ "${STEAMLINE_APT_INSTALL:-0}" != "1" ]]; then
    echo "steamline: Not running as root — skipping automatic apt install." >&2
    echo "steamline: On minimal Ubuntu, use: curl -fsSL \"https://game.layeroneconstultants.com/install-agent.sh\" | sudo bash -s -- \"https://game.layeroneconstultants.com\" \"<TOKEN>\"" >&2
    echo "steamline: Or install: bash curl ca-certificates tar gzip, and i386 + lib32gcc-s1 for SteamCMD." >&2
    return 0
  fi

  echo "steamline: Installing base packages via apt (bash, curl, tar, 32-bit libs for SteamCMD)…" >&2
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq bash curl ca-certificates tar gzip libc6 || true
  if ! dpkg --print-foreign-architectures 2>/dev/null | grep -q '^i386$'; then
    dpkg --add-architecture i386 2>/dev/null || true
    apt-get update -qq
  fi
  # Valve linux32/steamcmd needs the i386 dynamic linker — install alone so other packages cannot skip it.
  echo "steamline: apt: libc6-i386 (32-bit loader for SteamCMD)…" >&2
  apt-get install -y libc6-i386 || true
  apt-get install -y -qq lib32gcc-s1 lib32stdc++6 lib32z1 2>/dev/null \
    || apt-get install -y -qq lib32gcc1 2>/dev/null || true
}

steamline_try_apk_bootstrap() {
  [[ "$(uname -s)" == "Linux" ]] || return 0
  [[ "${STEAMLINE_SKIP_APT:-0}" == "1" ]] && return 0
  [[ -x /sbin/apk ]] || return 0
  [[ "$(id -u)" == "0" ]] || return 0
  echo "steamline: Installing base packages via apk (bash, tar, curl)…" >&2
  apk add --no-cache bash tar curl ca-certificates || true
}

if [[ "$(uname -s)" == "Linux" ]]; then
  steamline_try_apt_bootstrap
  steamline_try_apk_bootstrap
fi

if ! command -v curl >/dev/null 2>&1; then
  die "curl is required but not found (install curl and re-run)."
fi

if ! command -v node >/dev/null 2>&1; then
  die "Node.js is required (v18+). Install from https://nodejs.org/ or your package manager."
fi

NODE_BIN="$(command -v node)"
NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if (( NODE_MAJOR < 18 )); then
  die "Node.js 18 or newer is required (found $(node -v))."
fi

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
