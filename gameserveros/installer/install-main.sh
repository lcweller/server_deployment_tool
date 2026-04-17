#!/bin/bash
set -euo pipefail
# GameServerOS first-boot TUI. Technical logs -> /var/log/gameserveros-install.log (never shown in UI).

LOG="/var/log/gameserveros-install.log"
: "${GAMESERVEROS_PLATFORM_URL_DEFAULT:=https://game.layeroneconsultants.com}"
GSOS_CFG="/etc/gameserveros"
DIALOG="dialog"
TARGET_DISK=""
LUKS_PASSPHRASE_FILE=""

log_tech() { echo "[$(date -Iseconds)] $*" >>"$LOG" 2>/dev/null || true; }

is_live() {
  grep -qE '(^| )boot=live( |$)' /proc/cmdline 2>/dev/null || [[ -d /run/live/medium ]]
}

live_source_disk() {
  local m p
  m="$(findmnt -nro SOURCE /run/live/medium 2>/dev/null || true)"
  [[ -z "$m" || ! -b "$m" ]] && return 0
  if lsblk -no TYPE "$m" 2>/dev/null | head -1 | grep -q part; then
    p="$(lsblk -ndo pkname "$m" 2>/dev/null | head -1 || true)"
    [[ -n "$p" ]] && echo "/dev/$p" && return 0
  fi
  if lsblk -no TYPE "$m" 2>/dev/null | head -1 | grep -q disk; then
    echo "$m"
  fi
}

collect_luks_passphrase() {
  local a b tf1 tf2
  tf1="$(mktemp)"; tf2="$(mktemp)"
  chmod 0600 "$tf1" "$tf2"
  if ! "$DIALOG" --insecure --passwordbox "Choose a passphrase for disk encryption.\n\nYou will need this on every boot." 12 60 2>"$tf1"; then
    rm -f "$tf1" "$tf2"
    return 1
  fi
  if ! "$DIALOG" --insecure --passwordbox "Confirm the passphrase." 10 60 2>"$tf2"; then
    rm -f "$tf1" "$tf2"
    return 1
  fi
  a="$(cat "$tf1")"; b="$(cat "$tf2")"
  rm -f "$tf1" "$tf2"
  if [[ "$a" != "$b" ]]; then
    "$DIALOG" --msgbox "Passphrases did not match. Try again." 8 50
    return 1
  fi
  if [[ "${#a}" -lt 8 ]]; then
    "$DIALOG" --msgbox "Passphrase is too short (minimum 8 characters)." 8 50
    return 1
  fi
  LUKS_PASSPHRASE_FILE="$(mktemp)"
  chmod 0600 "$LUKS_PASSPHRASE_FILE"
  printf '%s' "$a" >"$LUKS_PASSPHRASE_FILE"
  return 0
}

step_select_target_disk() {
  local exclude line d sz menu=() i=1 choice tf
  exclude="$(live_source_disk || true)"
  mapfile -t lines < <(lsblk -dpno NAME,SIZE,TYPE,RO | awk '$3=="disk" && $4==0 {print $1" "$2}')
  local candidates=()
  for line in "${lines[@]}"; do
    d="${line%% *}"
    [[ "$d" == /dev/loop* || "$d" == /dev/sr* || "$d" == /dev/fd* || "$d" == /dev/zram* ]] && continue
    [[ -n "$exclude" && "$d" == "$exclude" ]] && continue
    [[ -b "$d" ]] || continue
    candidates+=("$line")
  done
  if [[ "${#candidates[@]}" -eq 0 ]]; then
    "$DIALOG" --msgbox "No installable disk was found.\n\nIf you booted from USB, try another port or check that a virtual disk is attached." 12 60
    exit 1
  fi
  if [[ "${#candidates[@]}" -eq 1 ]]; then
    TARGET_DISK="${candidates[0]%% *}"
    sz="$(awk '{print $2}' <<<"${candidates[0]}")"
    "$DIALOG" --yesno "Install GameServerOS to this disk?\n\n$TARGET_DISK ($sz)\n\nEverything on this disk will be erased." 12 70 || exit 1
    return 0
  fi
  menu=()
  for line in "${candidates[@]}"; do
    d="${line%% *}"
    sz="$(awk '{print $2}' <<<"$line")"
    menu+=("$d" "$sz")
  done
  tf="$(mktemp)"
  if ! "$DIALOG" --menu "Select the disk to install to.\n\nAll data on the chosen disk will be erased." 18 72 8 "${menu[@]}" 2>"$tf"; then
    rm -f "$tf"
    exit 1
  fi
  TARGET_DISK="$(cat "$tf")"
  rm -f "$tf"
  [[ -b "$TARGET_DISK" ]] || exit 1
  "$DIALOG" --yesno "All data on\n\n$TARGET_DISK\n\nwill be permanently erased. Continue?" 12 70 || exit 1
}

cleanup_secrets() {
  if [[ -n "${LUKS_PASSPHRASE_FILE:-}" && -f "$LUKS_PASSPHRASE_FILE" ]]; then
    if command -v shred >/dev/null 2>&1; then
      shred -u "$LUKS_PASSPHRASE_FILE" 2>/dev/null || rm -f "$LUKS_PASSPHRASE_FILE"
    else
      rm -f "$LUKS_PASSPHRASE_FILE"
    fi
  fi
}
trap cleanup_secrets EXIT

require_root() {
  if [[ "$(id -u)" != "0" ]]; then
    "$DIALOG" --msgbox "This installer must run as the system administrator (root).\n\nPlease use a root shell or run with sudo." 10 60
    exit 1
  fi
}

step_welcome() {
  "$DIALOG" --title "GameServerOS" --msgbox "Welcome to GameServerOS.\n\nThis will set up your server to host game servers managed from your dashboard.\n\nPress OK to begin." 12 60
}

check_internet() {
  local ok=1
  if ping -c1 -W3 1.1.1.1 >/dev/null 2>&1 || ping -c1 -W3 8.8.8.8 >/dev/null 2>&1; then
    ok=0
  fi
  return "$ok"
}

step_network() {
  while true; do
    if check_internet; then
      "$DIALOG" --title "Internet" --msgbox "Connected to the internet (good)." 8 50
      return 0
    fi
    local tf choice
    tf="$(mktemp)"
    "$DIALOG" --menu "We could not reach the internet from this machine.\n\nPlease check your network cable or Wi‑Fi, and that your router is online.\n\nThis platform needs the internet to finish setup." 16 60 2 \
      "retry" "Try the connection test again" \
      "manual" "Configure network manually" 2>"$tf"
    choice="$(cat "$tf")"
    rm -f "$tf"
    if [[ "$choice" == "retry" ]]; then
      continue
    fi
    if [[ "$choice" == "manual" ]]; then
      tf="$(mktemp)"
      "$DIALOG" --menu "How should this machine get its network address?" 12 50 2 \
        "dhcp" "Automatic (DHCP) — recommended" \
        "static" "Static IP (advanced)" 2>"$tf"
      local mode
      mode="$(cat "$tf")"
      rm -f "$tf"
      if [[ "$mode" == "dhcp" ]]; then
        if command -v dhclient >/dev/null 2>&1; then
          dhclient -v 2>>"$LOG" || true
        elif command -v dhcpcd >/dev/null 2>&1; then
          dhcpcd -n 2>>"$LOG" || true
        fi
      elif [[ "$mode" == "static" ]]; then
        "$DIALOG" --msgbox "Static IP setup is not fully automated in this build.\n\nPlease configure your network using your provider’s instructions, then return here and choose Retry." 12 58
      fi
    fi
  done
}

prompt_platform_url() {
  local def="$GAMESERVEROS_PLATFORM_URL_DEFAULT"
  local tf
  tf="$(mktemp)"
  if ! "$DIALOG" --title "Dashboard address" --inputbox "Enter your Steamline dashboard web address (usually pre-filled).\n\nExample: https://your-dashboard.example.com" 12 70 "$def" 2>"$tf"; then
    BASE="$def"
  else
    BASE="$(tail -1 "$tf" | tr -d '\r')"
  fi
  rm -f "$tf"
  BASE="${BASE%/}"
  install -d -m0755 "$GSOS_CFG"
  printf '%s\n' "$BASE" >"${GSOS_CFG}/platform-url"
}

step_pairing() {
  prompt_platform_url
  local json poll code
  if ! json="$(curl -fsS -m 60 -X POST "$BASE/api/public/gameserveros/install-session")"; then
    log_tech "install-session failed: $json"
    "$DIALOG" --msgbox "We could not reach your dashboard to start linking.\n\nPlease check the address you entered and your internet connection, then run this installer again." 12 60
    exit 1
  fi
  poll="$(echo "$json" | jq -r .pollToken)"
  code="$(echo "$json" | jq -r .pairingCode)"
  log_tech "pairing code issued (masked): ${code:0:2}****"
  "$DIALOG" --title "Link your account" --msgbox "On another device, open your dashboard in a web browser.\n\nGo to: Hosts → Link GameServerOS (or Add host), and enter this code exactly:\n\n        $code\n\nDashboard:\n$BASE\n\nWe will wait while you complete this step." 18 62
  while true; do
    local st
    st="$(curl -fsS -m 30 -H "Authorization: Bearer $poll" "$BASE/api/public/gameserveros/install-session/status" | jq -r .status)"
    if [[ "$st" == "linked" ]]; then
      "$DIALOG" --msgbox "Connected to your account!\n\nYou can close the other device — we will finish setup on this machine." 10 55
      break
    fi
    if [[ "$st" == "expired" ]]; then
      "$DIALOG" --msgbox "This code has expired.\n\nOn your dashboard, cancel and start again to get a fresh code, then reboot this installer." 11 58
      exit 1
    fi
    sleep 4
  done
  PAIRING_CODE="$code"
}

step_host_wizard() {
  local tf
  tf="$(mktemp)"
  if "$DIALOG" --inputbox "What would you like to call this server?" 10 60 "My Game Server" 2>"$tf"; then
    HOST_NAME="$(tail -1 "$tf" | tr -d '\r')"
  else
    HOST_NAME="My Game Server"
  fi
  rm -f "$tf"
  tf="$(mktemp)"
  if "$DIALOG" --inputbox "Time zone (e.g. America/New_York).\nLeave blank to keep the system default." 12 60 "" 2>"$tf"; then
    TZ_SEL="$(tail -1 "$tf" | tr -d '\r')"
  else
    TZ_SEL=""
  fi
  rm -f "$tf"
  if [[ -n "${TZ_SEL:-}" ]]; then
    timedatectl set-timezone "$TZ_SEL" 2>>"$LOG" || true
  fi
  local tf enc
  tf="$(mktemp)"
  "$DIALOG" --menu "Would you like to encrypt your server's storage?\n\nThis adds security but requires a passphrase at every boot for encrypted volumes." 14 62 2 \
    "no" "No, skip encryption (simpler)" \
    "yes" "Yes, encrypt data volumes (recommended for physical servers)" 2>"$tf"
  enc="$(cat "$tf")"
  rm -f "$tf"
  [[ -z "$enc" ]] && enc="no"
  USE_ENCRYPTION=0
  [[ "$enc" == "yes" ]] && USE_ENCRYPTION=1

  local upd
  tf="$(mktemp)"
  "$DIALOG" --menu "How should this server handle system updates?" 14 62 3 \
    "automatic" "Automatic — install updates when scheduled" \
    "scheduled" "Scheduled — install in a daily window" \
    "manual" "Manual — update from the dashboard when I am ready" 2>"$tf"
  upd="$(cat "$tf")"
  rm -f "$tf"
  [[ -z "$upd" ]] && upd="manual"
  install -d -m0755 "$GSOS_CFG"
  jq -n --arg mode "$upd" '{mode:$mode,window:{day:0,hour:4,minute:0}}' >"${GSOS_CFG}/update-policy.json"
}

step_install_progress() {
  (
    echo 10
    echo "XXX"
    echo "Setting up your server..."
    echo "XXX"
    echo 40
    echo "XXX"
    echo "Installing game server tools..."
    echo "XXX"
    echo 70
    echo "XXX"
    echo "Securing your system..."
    echo "XXX"
    echo 90
    echo "XXX"
    echo "Almost done..."
    echo "XXX"
    echo 100
  ) | "$DIALOG" --gauge "Please wait — this can take several minutes." 8 60 0
}

warn_hardware() {
  local mem_kb=0
  mem_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
  if [[ "${mem_kb:-0}" -lt 4000000 ]]; then
    "$DIALOG" --yesno "This machine may not have enough resources to run game servers smoothly.\n\nWe recommend at least 8 GB of memory and 4 CPU cores for a comfortable experience.\n\nYou can still continue, but performance may be limited.\n\nContinue anyway?" 14 62 || exit 0
  fi
}

run_enroll() {
  export STEAMLINE_INSTALL_SKIP_RUN="${STEAMLINE_INSTALL_SKIP_RUN:-1}"
  curl -fsSL "$BASE/install-agent.sh" -o /tmp/steamline-install-agent.sh
  chmod +x /tmp/steamline-install-agent.sh
  bash /tmp/steamline-install-agent.sh "$BASE" --pairing-code "$PAIRING_CODE"
  install -d -m0700 /root/.steamline
  if [[ -f "$HOME/.steamline/steamline-agent.env" ]]; then
    cp -a "$HOME/.steamline/steamline-agent.env" /root/.steamline/ 2>/dev/null || true
  fi
  printf 'STEAMLINE_PLATFORM_URL=%q\n' "$BASE" >"${GSOS_CFG}/agent.env"
  chmod 0600 "${GSOS_CFG}/agent.env"
}

run_live_disk_install() {
  export TARGET_DISK
  export INSTALL_BASE_URL="$BASE"
  export INSTALL_PAIRING_CODE="$PAIRING_CODE"
  export INSTALL_USE_ENCRYPTION="$USE_ENCRYPTION"
  export INSTALL_HOST_NAME="${HOST_NAME:-gameserveros}"
  if [[ "$USE_ENCRYPTION" == "1" ]]; then
    export INSTALL_LUKS_PASSPHRASE_FILE="$LUKS_PASSPHRASE_FILE"
  else
    unset INSTALL_LUKS_PASSPHRASE_FILE || true
  fi
  log_tech "starting install-to-target on $TARGET_DISK"
  if [[ ! -x /opt/gameserveros/scripts/install-to-target.sh ]]; then
    "$DIALOG" --msgbox "Internal error: install-to-target.sh is missing." 8 50
    exit 1
  fi
  "$DIALOG" --infobox "Installing to disk…\n\nPartitioning, copying files, and installing the bootloader.\n\nThis usually takes 10–30 minutes.\n\nDetails: $LOG" 12 60
  if ! /opt/gameserveros/scripts/install-to-target.sh >>"$LOG" 2>&1; then
    log_tech "install-to-target failed"
    "$DIALOG" --msgbox "Installation failed.\n\nSee $LOG on this system (or scroll the console) for technical details." 12 60
    exit 1
  fi
  log_tech "install-to-target finished"
}

main() {
  require_root
  install -d -m0755 "$GSOS_CFG"
  if is_live; then log_tech "installer start live=yes"; else log_tech "installer start live=no"; fi
  step_welcome
  step_network
  step_pairing
  step_host_wizard

  if is_live; then
    if [[ "$USE_ENCRYPTION" == "1" ]]; then
      until collect_luks_passphrase; do :; done
    fi
    step_select_target_disk
    warn_hardware
    run_live_disk_install
    cleanup_secrets
    LUKS_PASSPHRASE_FILE=""
    "$DIALOG" --msgbox "Installation finished.\n\nRemove the USB stick or eject the ISO image so the machine boots from the hard disk.\n\nThe system will reboot now." 14 62
    log_tech "live installer complete"
    systemctl reboot || reboot -f || shutdown -r now "GameServerOS install complete"
    exit 0
  fi

  warn_hardware
  step_install_progress
  if [[ -x /opt/gameserveros/scripts/apply-os-hardening.sh ]]; then
    GAMESERVEROS_VENDOR_ROOT="${GAMESERVEROS_VENDOR_ROOT:-/opt/gameserveros/vendor}" /opt/gameserveros/scripts/apply-os-hardening.sh || log_tech "hardening non-fatal"
  fi
  run_enroll
  systemctl enable steamline-agent.service 2>>"$LOG" || true
  systemctl start steamline-agent.service 2>>"$LOG" || true
  local ip="unknown" hname="(see dashboard)" key=""
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  if [[ -f /root/.steamline/steamline-agent.env ]]; then
    key="$(awk -F= '/^STEAMLINE_API_KEY=/{print $2}' /root/.steamline/steamline-agent.env | tr -d '"' | tr -d "'")"
    if [[ -n "$key" ]]; then
      hname="$(curl -fsS -m 20 -H "Authorization: Bearer ${key}" "$BASE/api/v1/agent/host" | jq -r '.host.name // empty')" || hname="(see dashboard)"
    fi
  fi
  touch "${GSOS_CFG}/install-done"
  "$DIALOG" --msgbox "Your server is ready!\n\nName: $hname\nAddress: $ip\nDashboard: $BASE\n\nVisit your dashboard to deploy your first game server.\n\nThe system will reboot in a few seconds." 14 60
  log_tech "installer complete"
  shutdown -r +1 "GameServerOS setup complete" >/dev/null 2>&1 || reboot
}

main "$@"
