#!/bin/bash
set -euo pipefail
# Apply sysctl, AppArmor templates, nftables baseline, mask ssh, disable noisy services.
# Vendor tree is staged under /opt/gameserveros/vendor during image build.

ROOT="${GAMESERVEROS_VENDOR_ROOT:-/opt/gameserveros/vendor}"
LOG="${GAMESERVEROS_INSTALL_LOG:-/var/log/gameserveros-install.log}"

log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG" >/dev/null || true; }

if [[ "$(id -u)" != "0" ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

log "apply-os-hardening: vendor root $ROOT"

if [[ -d "$ROOT/config/sysctl" ]]; then
  cp -n "$ROOT/config/sysctl/"*.conf /etc/sysctl.d/ 2>/dev/null || cp "$ROOT/config/sysctl/"*.conf /etc/sysctl.d/
  sysctl --system || true
fi

if [[ -d "$ROOT/config/apparmor" ]]; then
  install -m0644 "$ROOT/config/apparmor/"* /etc/apparmor.d/ 2>/dev/null || true
  if command -v aa-enforce >/dev/null 2>&1; then
    for f in "$ROOT/config/apparmor/"*; do
      [[ -f "$f" ]] || continue
      bn="$(basename "$f")"
      aa-enforce "/etc/apparmor.d/$bn" 2>/dev/null || true
    done
  fi
fi

if [[ -f "$ROOT/nftables/99-gameserveros-nftables.nft" ]]; then
  install -d /etc/nftables.d
  install -m0644 "$ROOT/nftables/99-gameserveros-nftables.nft" /etc/nftables.d/99-gameserveros.nft || true
fi

systemctl mask --now ssh.service 2>/dev/null || systemctl mask --now sshd.service 2>/dev/null || true
systemctl disable --now bluetooth.service 2>/dev/null || true
systemctl disable --now avahi-daemon.service 2>/dev/null || true
systemctl disable --now cups.service 2>/dev/null || true

install -d -m0755 /var/lib/steamline /var/gameserveros/games /var/gameserveros/logs /var/gameserveros/backups

log "apply-os-hardening: done"
