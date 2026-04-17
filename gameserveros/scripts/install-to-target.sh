#!/bin/bash
set -euo pipefail
# Copy running live root to TARGET_DISK, install GRUB (UEFI + BIOS), fstab, enroll agent in chroot.

LOG="${GAMESERVEROS_INSTALL_LOG:-/var/log/gameserveros-install.log}"
log() { echo "[$(date -Iseconds)] $*" | tee -a "$LOG" >&2; }

: "${TARGET_DISK:?TARGET_DISK required}"
: "${INSTALL_BASE_URL:?INSTALL_BASE_URL required}"
: "${INSTALL_PAIRING_CODE:?INSTALL_PAIRING_CODE required}"

DISK="$TARGET_DISK"
USE_ENCRYPTION="${INSTALL_USE_ENCRYPTION:-0}"
LUKS_PASSPHRASE_FILE="${INSTALL_LUKS_PASSPHRASE_FILE:-}"
INSTALL_HOST_NAME="${INSTALL_HOST_NAME:-gameserveros}"

# Partition suffix: /dev/sda1 vs /dev/nvme0n1p1
part_path() {
  local n="$1"
  case "$DISK" in
    /dev/nvme*|/dev/mmcblk*|/dev/loop*) echo "${DISK}p${n}" ;;
    *) echo "${DISK}${n}" ;;
  esac
}

if [[ "$(id -u)" != "0" ]]; then
  echo "root required" >&2
  exit 1
fi
if [[ ! -b "$DISK" ]]; then
  log "not a block device: $DISK"
  exit 1
fi
for x in sgdisk partprobe mkfs.ext4 mkfs.vfat rsync; do
  command -v "$x" >/dev/null 2>&1 || { log "missing: $x"; exit 1; }
done

BYTES="$(blockdev --getsize64 "$DISK")"
# Full multi-volume layout needs ~34 GiB; below that use root + single /var
FULL_LAYOUT=1
if [[ "$BYTES" -lt $((34 * 1024 * 1024 * 1024)) ]]; then
  FULL_LAYOUT=0
  log "using compact layout (disk < 34 GiB)"
fi

log "wipe and partition $DISK"
wipefs -a "$DISK" 2>/dev/null || true
sgdisk --zap-all "$DISK" 2>/dev/null || true
sgdisk -n1:0:+512M -t1:ef00 -c1:EFI "$DISK"
sgdisk -n2:0:+1M -t2:ef02 -c2:BIOS_GRUB "$DISK"

if [[ "$FULL_LAYOUT" == 0 ]]; then
  sgdisk -n3:0:+8G -t3:8300 -c3:ROOT "$DISK"
  sgdisk -n4:0:0 -t4:8300 -c4:VAR "$DISK"
else
  sgdisk -n3:0:+14G -t3:8300 -c3:ROOT "$DISK"
  sgdisk -n4:0:+8G -t4:8300 -c4:AGENT "$DISK"
  sgdisk -n5:0:+8G -t5:8300 -c5:LOGS "$DISK"
  sgdisk -n6:0:0 -t6:8300 -c6:GAMES "$DISK"
fi
partprobe "$DISK" 2>/dev/null || true
sleep 2

ESP="$(part_path 1)"
ROOTD="$(part_path 3)"

mkfs.vfat -F32 -n EFI "$ESP"
mkfs.ext4 -F -L gsos-root "$ROOTD"

ROOT_MNT=/mnt/gsos-target
mkdir -p "$ROOT_MNT"
mount "$ROOTD" "$ROOT_MNT"
mkdir -p "$ROOT_MNT/boot/efi" "$ROOT_MNT/var/lib/steamline" "$ROOT_MNT/var/gameserveros/logs" "$ROOT_MNT/var/gameserveros/games" "$ROOT_MNT/var/gameserveros/backups"
mount "$ESP" "$ROOT_MNT/boot/efi"

EP="$(blkid -s PARTUUID -o value "$ESP")"
RP="$(blkid -s PARTUUID -o value "$ROOTD")"

write_fstab() {
  cat >"$ROOT_MNT/etc/fstab" <<EOF
PARTUUID=$EP /boot/efi vfat umask=0077 0 1
PARTUUID=$RP / ext4 defaults,discard 0 1
$*
EOF
}

if [[ "$FULL_LAYOUT" == 0 ]]; then
  VARP="$(part_path 4)"
  if [[ "$USE_ENCRYPTION" == "1" ]]; then
    [[ -f "$LUKS_PASSPHRASE_FILE" ]] || { log "missing passphrase file"; exit 1; }
    cryptsetup luksFormat -q --type luks2 "$VARP" "$LUKS_PASSPHRASE_FILE"
    cryptsetup open --type luks2 --key-file "$LUKS_PASSPHRASE_FILE" "$VARP" gsos-var
    mkfs.ext4 -F -L gsos-var /dev/mapper/gsos-var
    mount /dev/mapper/gsos-var "$ROOT_MNT/var"
    VP="$(blkid -s PARTUUID -o value "$VARP")"
    VU="$(blkid -s UUID -o value /dev/mapper/gsos-var)"
    cat >"$ROOT_MNT/etc/crypttab" <<EOF
gsos-var PARTUUID=$VP none luks,discard
EOF
    write_fstab "UUID=$VU /var ext4 defaults,discard 0 2"
  else
    mkfs.ext4 -F -L gsos-var "$VARP"
    mount "$VARP" "$ROOT_MNT/var"
    VP="$(blkid -s PARTUUID -o value "$VARP")"
    rm -f "$ROOT_MNT/etc/crypttab"
    write_fstab "PARTUUID=$VP /var ext4 defaults,discard 0 2"
  fi
  mkdir -p "$ROOT_MNT/var/lib/steamline" "$ROOT_MNT/var/gameserveros/logs" "$ROOT_MNT/var/gameserveros/games" "$ROOT_MNT/var/gameserveros/backups"
else
  AG="$(part_path 4)"
  LG="$(part_path 5)"
  GM="$(part_path 6)"
  mkfs.ext4 -F -L gsos-agent "$AG"
  mkfs.ext4 -F -L gsos-logs "$LG"
  if [[ "$USE_ENCRYPTION" == "1" ]]; then
    [[ -f "$LUKS_PASSPHRASE_FILE" ]] || { log "missing passphrase file"; exit 1; }
    cryptsetup luksFormat -q --type luks2 "$GM" "$LUKS_PASSPHRASE_FILE"
    cryptsetup open --type luks2 --key-file "$LUKS_PASSPHRASE_FILE" "$GM" gsos-games
    mkfs.ext4 -F -L gsos-games /dev/mapper/gsos-games
    GDEV=/dev/mapper/gsos-games
    GP="$(blkid -s PARTUUID -o value "$GM")"
    cat >"$ROOT_MNT/etc/crypttab" <<EOF
gsos-games PARTUUID=$GP none luks,discard
EOF
  else
    mkfs.ext4 -F -L gsos-games "$GM"
    GDEV="$GM"
    rm -f "$ROOT_MNT/etc/crypttab"
  fi
  mount "$AG" "$ROOT_MNT/var/lib/steamline"
  mount "$LG" "$ROOT_MNT/var/gameserveros/logs"
  mount "$GDEV" "$ROOT_MNT/var/gameserveros/games"
  mkdir -p "$ROOT_MNT/var/gameserveros/games/local-backups"
  mount --bind "$ROOT_MNT/var/gameserveros/games/local-backups" "$ROOT_MNT/var/gameserveros/backups"
  AP="$(blkid -s PARTUUID -o value "$AG")"
  LP="$(blkid -s PARTUUID -o value "$LG")"
  GU="$(blkid -s UUID -o value "$GDEV")"
  if [[ "$USE_ENCRYPTION" == "1" ]]; then
    write_fstab "PARTUUID=$AP /var/lib/steamline ext4 defaults,discard 0 2
PARTUUID=$LP /var/gameserveros/logs ext4 defaults,discard 0 2
UUID=$GU /var/gameserveros/games ext4 defaults,discard 0 2
/var/gameserveros/games/local-backups /var/gameserveros/backups none bind 0 0
"
  else
    GP="$(blkid -s PARTUUID -o value "$GM")"
    write_fstab "PARTUUID=$AP /var/lib/steamline ext4 defaults,discard 0 2
PARTUUID=$LP /var/gameserveros/logs ext4 defaults,discard 0 2
PARTUUID=$GP /var/gameserveros/games ext4 defaults,discard 0 2
/var/gameserveros/games/local-backups /var/gameserveros/backups none bind 0 0
"
  fi
fi

log "rsync / -> $ROOT_MNT"
RSYNC_EXCL=(
  --exclude=/dev/*
  --exclude=/proc/*
  --exclude=/sys/*
  --exclude=/tmp/*
  --exclude=/run/*
  --exclude=/mnt/*
  --exclude=/media/*
  --exclude=/lost+found
  --exclude=/swapfile
)
rsync -aHAX --info=progress2 "${RSYNC_EXCL[@]}" / "$ROOT_MNT/"

rm -f "$ROOT_MNT/etc/machine-id" "$ROOT_MNT/var/lib/dbus/machine-id" 2>/dev/null || true
if command -v systemd-machine-id-setup >/dev/null 2>&1; then
  systemd-machine-id-setup --root="$ROOT_MNT" 2>/dev/null || true
fi

mkdir -p "$ROOT_MNT/etc/default/grub.d"
echo 'GRUB_CMDLINE_LINUX_DEFAULT="ipv6.disable=1 quiet"' >"$ROOT_MNT/etc/default/grub.d/99-gameserveros.cfg"
printf '%s\n' "$INSTALL_HOST_NAME" >"$ROOT_MNT/etc/hostname"

mount --bind /dev "$ROOT_MNT/dev"
mount --bind /proc "$ROOT_MNT/proc"
mount --bind /sys "$ROOT_MNT/sys"
mount --bind /run "$ROOT_MNT/run"

chroot "$ROOT_MNT" /bin/bash -s <<'CHROOT'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
systemctl disable gameserveros-live-installer.service 2>/dev/null || true
rm -f /etc/systemd/system/multi-user.target.wants/gameserveros-live-installer.service
rm -f /etc/systemd/system/sysinit.target.wants/gameserveros-live-installer.service
apt-get purge -y live-boot live-config-systemd 2>/dev/null || true
apt-get autoremove -y --purge 2>/dev/null || true
update-initramfs -u -k all || true
CHROOT

if [[ -x "$ROOT_MNT/opt/gameserveros/scripts/apply-os-hardening.sh" ]]; then
  chroot "$ROOT_MNT" env GAMESERVEROS_VENDOR_ROOT=/opt/gameserveros/vendor /opt/gameserveros/scripts/apply-os-hardening.sh || log "hardening warn"
fi

chroot "$ROOT_MNT" /bin/bash -s <<CHROOT
set -euo pipefail
export STEAMLINE_INSTALL_SKIP_RUN=1
curl -fsSL "${INSTALL_BASE_URL}/install-agent.sh" -o /tmp/steamline-install-agent.sh
chmod +x /tmp/steamline-install-agent.sh
bash /tmp/steamline-install-agent.sh "${INSTALL_BASE_URL}" --pairing-code "${INSTALL_PAIRING_CODE}"
mkdir -p /root/.steamline /etc/gameserveros
printf '%s\n' "${INSTALL_BASE_URL}" >/etc/gameserveros/platform-url
printf 'STEAMLINE_PLATFORM_URL=%q\n' "${INSTALL_BASE_URL}" >/etc/gameserveros/agent.env
chmod 0600 /etc/gameserveros/agent.env 2>/dev/null || true
systemctl enable steamline-agent.service
CHROOT

touch "$ROOT_MNT/etc/gameserveros/install-done"

chroot "$ROOT_MNT" env DISK="$DISK" /bin/bash -s <<'CHROOT'
set -euo pipefail
grub-install --target=x86_64-efi --efi-directory=/boot/efi --bootloader-id=GRUB --recheck "$DISK" || true
grub-install --target=i386-pc --recheck "$DISK"
update-grub
CHROOT

umount "$ROOT_MNT/run" "$ROOT_MNT/sys" "$ROOT_MNT/proc" "$ROOT_MNT/dev" || true
# Unmount deepest first
if [[ "$FULL_LAYOUT" == 1 ]]; then
  umount "$ROOT_MNT/var/gameserveros/backups" 2>/dev/null || true
  umount "$ROOT_MNT/var/gameserveros/games" 2>/dev/null || true
  umount "$ROOT_MNT/var/gameserveros/logs" 2>/dev/null || true
  umount "$ROOT_MNT/var/lib/steamline" 2>/dev/null || true
elif [[ "$USE_ENCRYPTION" == "1 ]]; then
  umount "$ROOT_MNT/var" 2>/dev/null || true
  cryptsetup close gsos-var 2>/dev/null || true
else
  umount "$ROOT_MNT/var" 2>/dev/null || true
fi
umount "$ROOT_MNT/boot/efi" || true
umount "$ROOT_MNT" || true
if [[ "$FULL_LAYOUT" == 1 && "$USE_ENCRYPTION" == 1 ]]; then
  cryptsetup close gsos-games 2>/dev/null || true
fi

log "install-to-target done"
