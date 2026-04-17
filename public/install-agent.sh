#!/usr/bin/env bash
# Steamline agent — one-line install (Linux / macOS / WSL).
#
# Enrollment token (long secret from Add host → Advanced):
#   curl -fsSL "https://example.com/install-agent.sh" | bash -s -- "https://example.com" "<ENROLLMENT_TOKEN>"
#
# Pairing code (short code from Add host — GameServerOS or typed enroll):
#   curl -fsSL "https://example.com/install-agent.sh" | bash -s -- "https://example.com" --pairing-code "ABCD-1234"
#
# Requires: curl, bash. Node.js 18+ is installed automatically via apt/apk when running
# as root (or STEAMLINE_APT_INSTALL=1). Otherwise install Node yourself.
# After enroll, starts the agent in the background (no second SSH session needed).
# Set STEAMLINE_INSTALL_SKIP_RUN=1 to only enroll and write steamline-agent.env.
# Set STEAMLINE_SKIP_NODE_INSTALL=1 to never install Node via apt/apk (use existing node).
#
# Self-update (Linux; agent uses WebSocket to the dashboard):
#   STEAMLINE_AGENT_AUTO_UPDATE=1       — periodically download and install newer steamline-agent.cjs from the control plane
#   STEAMLINE_AGENT_UPDATE_INTERVAL_MS  — check interval (default 21600000 = 6 hours)
# Or use Host → Agent updates in the dashboard ("Update now" / "Check on host").
#
# Agent automation (defaults ON — set to 1 to skip pieces):
#   STEAMLINE_SKIP_UPNP              — do not ask the router (UPnP IGD) to forward ports
#   STEAMLINE_SKIP_FIREWALL          — Windows: skip netsh inbound rules
#   STEAMLINE_SKIP_LINUX_FIREWALL    — Linux: skip firewalld --add-port
#   STEAMLINE_DISABLE_AUTO_LAUNCH    — do not guess a dedicated .exe/.x86_64 after install
#   STEAMLINE_UPNP_LEASE_SEC         — UPnP mapping lifetime in seconds (default 7200)
#
# Minimal Ubuntu: run with sudo so dependencies can be installed, or set STEAMLINE_APT_INSTALL=1.
# Set STEAMLINE_SKIP_APT=1 to never run apt/apk.
# Set STEAMLINE_SKIP_LINUX_ROOT_BOOTSTRAP=1 to skip installing sudo, setting a random Linux root
# password, and reporting it to the dashboard (Linux + root installs only).
# Set STEAMLINE_ALLOW_DUPLICATE_ENROLL=1 to bypass the "already installed" guard (not recommended).
set -euo pipefail

die() {
  echo "steamline: $*" >&2
  exit 1
}

steamline_node_version_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local m
  m="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  [[ "$m" =~ ^[0-9]+$ ]] && (( m >= 18 ))
}

BASE_URL="${1:-}"
TOKEN=""
PAIRING_CODE=""

if [[ -z "$BASE_URL" ]]; then
  die 'usage: curl -fsSL "<dashboard>/install-agent.sh" | bash -s -- "<BASE_URL>" "<ENROLLMENT_TOKEN>"  OR  ... "<BASE_URL>" --pairing-code "<CODE>"'
fi

if [[ "${2:-}" == "--pairing-code" ]]; then
  PAIRING_CODE="${3:-}"
  if [[ -z "$PAIRING_CODE" ]]; then
    die 'usage: ... bash -s -- "<BASE_URL>" --pairing-code "<PAIRING_CODE>"'
  fi
elif [[ -n "${2:-}" ]]; then
  TOKEN="$2"
else
  die 'usage: curl -fsSL "<dashboard>/install-agent.sh" | bash -s -- "<BASE_URL>" "<ENROLLMENT_TOKEN>"  OR  ... "<BASE_URL>" --pairing-code "<CODE>"'
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
    echo "steamline: On minimal Ubuntu, use: curl -fsSL \"<dashboard>/install-agent.sh\" | sudo bash -s -- \"<BASE_URL>\" \"<TOKEN>\"  or  ... \"<BASE_URL>\" --pairing-code \"<CODE>\"" >&2
    echo "steamline: Or install: bash curl ca-certificates tar gzip, and i386 + lib32gcc-s1 for SteamCMD." >&2
    return 0
  fi

  echo "steamline: Installing base packages via apt (bash, curl, sudo, dmidecode, tar, 32-bit libs for SteamCMD)…" >&2
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq bash curl ca-certificates sudo dmidecode tar gzip libc6 || true
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

# Debian/Ubuntu: ensure Node.js 18+ (agent is a Node bundle). Uses distro package when
# new enough, otherwise NodeSource 20.x LTS.
steamline_try_apt_install_nodejs() {
  [[ "${STEAMLINE_SKIP_NODE_INSTALL:-0}" == "1" ]] && return 0
  [[ "$(uname -s)" == "Linux" ]] || return 0
  [[ "${STEAMLINE_SKIP_APT:-0}" == "1" ]] && return 0
  [[ -x /usr/bin/apt-get ]] || return 0
  if [[ "$(id -u)" != "0" ]] && [[ "${STEAMLINE_APT_INSTALL:-0}" != "1" ]]; then
    return 0
  fi

  steamline_node_version_ok && return 0

  echo "steamline: Installing Node.js (v18+ required for the agent)…" >&2
  export DEBIAN_FRONTEND=noninteractive

  # Ubuntu 24.04+ and some derivatives ship nodejs 18+ in main/universe.
  apt-get install -y -qq nodejs 2>/dev/null || true
  if steamline_node_version_ok; then
    echo "steamline: Using Node.js $(command -v node) ($(node -v))." >&2
    return 0
  fi

  echo "steamline: Adding NodeSource 20.x (distro Node missing or too old)…" >&2
  if command -v node >/dev/null 2>&1 && ! steamline_node_version_ok; then
    apt-get remove -y nodejs npm 2>/dev/null || true
    apt-get autoremove -y 2>/dev/null || true
  fi
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs

  if steamline_node_version_ok; then
    echo "steamline: Node.js $(node -v) ready." >&2
    return 0
  fi

  echo "steamline: Could not install Node.js automatically." >&2
  return 0
}

steamline_try_apk_bootstrap() {
  [[ "$(uname -s)" == "Linux" ]] || return 0
  [[ "${STEAMLINE_SKIP_APT:-0}" == "1" ]] && return 0
  [[ -x /sbin/apk ]] || return 0
  [[ "$(id -u)" == "0" ]] || return 0
  echo "steamline: Installing base packages via apk (bash, tar, curl)…" >&2
  apk add --no-cache bash tar curl ca-certificates || true
  if [[ "${STEAMLINE_SKIP_NODE_INSTALL:-0}" != "1" ]]; then
    if ! steamline_node_version_ok; then
      echo "steamline: Installing Node.js via apk…" >&2
      apk add --no-cache nodejs npm 2>/dev/null || true
    fi
  fi
}

if [[ "$(uname -s)" == "Linux" ]]; then
  steamline_try_apt_bootstrap
  steamline_try_apt_install_nodejs
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

# Optional native module for dashboard remote terminal (node-pty); non-fatal if npm fails.
if [[ "$(uname -s)" == "Linux" ]] && [[ ! -d "$INSTALL_ROOT/node_modules/node-pty" ]]; then
  echo "steamline: Installing node-pty (remote terminal)…" >&2
  if command -v npm >/dev/null 2>&1; then
    npm install --prefix "$INSTALL_ROOT" node-pty@1.0.0 --omit=dev --no-audit --no-fund 2>/dev/null \
      || echo "steamline: Warning: node-pty install failed — remote terminal unavailable until: npm install --prefix $INSTALL_ROOT node-pty" >&2
  else
    echo "steamline: npm not found — install node-pty later for remote terminal: npm install --prefix $INSTALL_ROOT node-pty" >&2
  fi
fi

# Optional transport module for SFTP backups; non-fatal if npm fails.
if [[ "$(uname -s)" == "Linux" ]] && [[ ! -d "$INSTALL_ROOT/node_modules/ssh2-sftp-client" ]]; then
  echo "steamline: Installing ssh2-sftp-client (SFTP backups)…" >&2
  if command -v npm >/dev/null 2>&1; then
    npm install --prefix "$INSTALL_ROOT" ssh2-sftp-client --omit=dev --no-audit --no-fund 2>/dev/null \
      || echo "steamline: Warning: ssh2-sftp-client install failed — SFTP backups unavailable until: npm install --prefix $INSTALL_ROOT ssh2-sftp-client" >&2
  else
    echo "steamline: npm not found — install ssh2-sftp-client later for SFTP backups: npm install --prefix $INSTALL_ROOT ssh2-sftp-client" >&2
  fi
fi

TMPJSON="$(mktemp)"
cleanup() {
  rm -f "$TMPJSON"
}
trap cleanup EXIT

set +e
if [[ -n "$PAIRING_CODE" ]]; then
  node "$INSTALL_ROOT/steamline-agent.cjs" enroll "$BASE_URL" --pairing-code "$PAIRING_CODE" >"$TMPJSON"
else
  node "$INSTALL_ROOT/steamline-agent.cjs" enroll "$BASE_URL" "$TOKEN" >"$TMPJSON"
fi
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

# --- Linux + root: ensure sudo exists, set a random root password, report to the dashboard (encrypted at rest) ---
steamline_linux_post_enroll_root() {
  [[ "$(uname -s)" == "Linux" ]] || return 0
  [[ "$(id -u)" == "0" ]] || return 0
  [[ "${STEAMLINE_SKIP_LINUX_ROOT_BOOTSTRAP:-0}" == "1" ]] && return 0

  if ! command -v sudo >/dev/null 2>&1; then
    if [[ -x /usr/bin/apt-get ]]; then
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -qq
      apt-get install -y -qq sudo || true
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y -q sudo || true
    elif command -v yum >/dev/null 2>&1; then
      yum install -y -q sudo || true
    elif [[ -x /sbin/apk ]]; then
      apk add --no-cache sudo || true
    fi
  fi

  local root_pw
  root_pw="$(openssl rand -base64 36 | tr -d '\n' | tr '+/' '-_')"
  if ! echo "root:${root_pw}" | chpasswd 2>/dev/null; then
    echo "steamline: Warning: could not set Linux root password (chpasswd failed). Set STEAMLINE_SKIP_LINUX_ROOT_BOOTSTRAP=1 to silence." >&2
    return 0
  fi

  local payload
  payload="$(PW="$root_pw" node -e "console.log(JSON.stringify({password:process.env.PW}))")" || die "could not encode root password payload"
  if ! curl -fsS -X POST "${BASE_URL}/api/v1/agent/host/linux-root-password" \
    -H "Authorization: Bearer ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$payload" >/dev/null; then
    echo "steamline: Warning: could not report Linux root password to the API (dashboard may not show it). The password was still changed on this machine." >&2
    return 0
  fi
  echo "steamline: Linux root password was set and stored in the dashboard (Host → Linux root access)." >&2
}

steamline_linux_post_enroll_root

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
