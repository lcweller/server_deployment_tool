#!/bin/bash
set -euo pipefail
# Policy file: /etc/gameserveros/update-policy.json
# { "mode": "automatic" | "scheduled" | "manual", "window": { "day": 0-6, "hour": 0, "minute": 0 } }

POLICY="/etc/gameserveros/update-policy.json"
LOG="/var/log/gameserveros-updater.log"
PLATFORM_URL_FILE="/etc/gameserveros/platform-url"
ENV_FILE="/root/.steamline/steamline-agent.env"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG" >/dev/null || true; }

mode="manual"
if [[ -f "$POLICY" ]] && command -v jq >/dev/null 2>&1; then
  mode="$(jq -r '.mode // "manual"' "$POLICY" 2>/dev/null || echo manual)"
fi

if [[ "$mode" == "manual" && "${RUN_MANUAL_OS_UPDATE:-0}" != "1" ]]; then
  log "mode=manual, skipping"
  exit 0
fi

if [[ "$mode" == "scheduled" && -f "$POLICY" ]] && command -v jq >/dev/null 2>&1; then
  wd="$(jq -r '.window.day // 0' "$POLICY")"
  wh="$(jq -r '.window.hour // 4' "$POLICY")"
  wm="$(jq -r '.window.minute // 0' "$POLICY")"
  cur_dow="$(date +%w)"
  cur_h="$(date +%H)"
  cur_m="$(date +%M)"
  if [[ "$cur_dow" != "$wd" ]]; then
    log "scheduled: wrong day ($cur_dow != $wd)"
    exit 0
  fi
  if [[ "10#$cur_h" -ne "10#$wh" ]]; then
    log "scheduled: wrong hour"
    exit 0
  fi
  if [[ "10#$cur_m" -lt "10#$wm" ]]; then
    log "scheduled: before minute window"
    exit 0
  fi
fi

if [[ ! -f "$PLATFORM_URL_FILE" || ! -f "$ENV_FILE" ]]; then
  log "missing platform url or agent env — cannot pre-check instances"
else
  BASE="$(tr -d '\r\n' <"$PLATFORM_URL_FILE")"
  key_line="$(grep -E '^STEAMLINE_API_KEY=' "$ENV_FILE" | tail -1 || true)"
  KEY="${key_line#STEAMLINE_API_KEY=}"
  KEY="${KEY//\"/}"
  if [[ -n "$KEY" ]]; then
    list_json="$(curl -fsS -m 45 -H "Authorization: Bearer $KEY" "$BASE/api/v1/agent/instances" || echo '{"instances":[]}')"
    if echo "$list_json" | jq -e '.instances | map(select(.status=="running" or .status=="starting" or .status=="recovering")) | length > 0' >/dev/null 2>&1; then
      log "game servers appear active — skipping OS package upgrade this cycle"
      exit 0
    fi
  fi
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

log "apt upgrade completed"
