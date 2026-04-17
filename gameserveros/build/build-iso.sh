#!/bin/bash
set -euo pipefail
# GameServerOS image build: Debian bookworm amd64 → hybrid UEFI+BIOS ISO.
# Output: dist/gameserveros-${GAMESERVEROS_VERSION}-amd64.iso (+ .sha256)
# Optional tarball: GAMESERVEROS_BUILD_ROOTFS_TAR=1 → dist/...-rootfs.tar.gz
#
# Host prerequisites: debootstrap, sudo, tar, curl, jq, xorriso, squashfs-tools,
#   mtools, dosfstools, grub-common, grub-pc-bin, grub-efi-amd64-bin
#
# Run on Debian/Ubuntu or GitHub Actions ubuntu-latest.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="${GAMESERVEROS_VERSION:-0.1.0}"
CODENAME="${GAMESERVEROS_CODENAME:-bookworm}"
MIRROR="${GAMESERVEROS_MIRROR:-http://deb.debian.org/debian}"
WORKDIR="${WORKDIR:-$(pwd)/.gameserveros-build}"
CHROOT="$WORKDIR/chroot"
ISO_STAGING="$WORKDIR/iso-staging"
OUT_DIR="$ROOT/dist"
AGENT_SRC="${AGENT_SRC:-$ROOT/public/steamline-agent.cjs}"
BUILD_ROOTFS_TAR="${GAMESERVEROS_BUILD_ROOTFS_TAR:-0}"

echo "==> GameServerOS ISO build $VERSION ($CODENAME)"

mkdir -p "$OUT_DIR" "$WORKDIR"

if [[ "$(id -u)" != "0" ]]; then
  echo "Re-running with sudo for debootstrap/chroot…"
  exec sudo \
    GAMESERVEROS_VERSION="$VERSION" \
    GAMESERVEROS_CODENAME="$CODENAME" \
    GAMESERVEROS_MIRROR="$MIRROR" \
    GAMESERVEROS_BUILD_ROOTFS_TAR="$BUILD_ROOTFS_TAR" \
    AGENT_SRC="$AGENT_SRC" \
    WORKDIR="$WORKDIR" \
    bash "$0" "$@"
fi

for cmd in debootstrap xorriso mksquashfs grub-mkrescue; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing host tool: $cmd" >&2
    echo "Install e.g.: apt-get install -y debootstrap xorriso squashfs-tools grub-common grub-pc-bin grub-efi-amd64-bin mtools dosfstools" >&2
    exit 1
  fi
done

rm -rf "$CHROOT" "$ISO_STAGING"
debootstrap --variant=minbase --merged-usr "$CODENAME" "$CHROOT" "$MIRROR"

install -d -m0755 "$CHROOT/opt/gameserveros/vendor"
"$ROOT/gameserveros/build/stage-vendor.sh" "$ROOT" "$CHROOT/opt/gameserveros/vendor"

install -d -m0755 "$CHROOT/opt/gameserveros/installer" "$CHROOT/opt/gameserveros/scripts" "$CHROOT/opt/steamline"
cp -a "$ROOT/gameserveros/installer/." "$CHROOT/opt/gameserveros/installer/"
cp -a "$ROOT/gameserveros/scripts/." "$CHROOT/opt/gameserveros/scripts/"
chmod +x "$CHROOT/opt/gameserveros/installer/"*.sh "$CHROOT/opt/gameserveros/scripts/"*.sh 2>/dev/null || true

if [[ -f "$AGENT_SRC" ]]; then
  install -m0755 "$AGENT_SRC" "$CHROOT/opt/steamline/steamline-agent.cjs"
else
  echo "WARN: agent bundle missing at $AGENT_SRC — place steamline-agent.cjs before release." >&2
fi

cp -a "$ROOT/gameserveros/systemd/." "$CHROOT/etc/systemd/system/"

chroot "$CHROOT" /bin/bash -s <<'CHROOT'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  systemd systemd-sysv dbus ca-certificates curl jq dialog whiptail libnewt0.52 \
  linux-image-amd64 \
  grub-common grub-pc grub-efi-amd64 grub-efi-amd64-bin grub-pc-bin os-prober \
  live-boot live-config-systemd \
  nftables apparmor apparmor-utils auditd \
  dmidecode pciutils usbutils util-linux smartmontools lm-sensors gdisk parted \
  dosfstools e2fsprogs rsync cryptsetup \
  bash-completion locales wget nodejs initramfs-tools
apt-get install -y -o APT::Install-Recommends=false \
  libc6-i386 lib32gcc-s1 lib32stdc++6 lib32z1 || true
systemctl enable gameserveros-first-boot.service 2>/dev/null || \
  ln -sf /etc/systemd/system/gameserveros-first-boot.service /etc/systemd/system/multi-user.target.wants/gameserveros-first-boot.service
systemctl enable gameserveros-live-installer.service 2>/dev/null || \
  ln -sf /etc/systemd/system/gameserveros-live-installer.service /etc/systemd/system/multi-user.target.wants/gameserveros-live-installer.service
systemctl enable gameserveros-updater.timer 2>/dev/null || \
  ln -sf /etc/systemd/system/gameserveros-updater.timer /etc/systemd/system/timers.target.wants/gameserveros-updater.timer
systemctl enable gameserveros-audit-forward.timer 2>/dev/null || \
  ln -sf /etc/systemd/system/gameserveros-audit-forward.timer /etc/systemd/system/timers.target.wants/gameserveros-audit-forward.timer
update-initramfs -c -k all
CHROOT

mkdir -p "$ISO_STAGING/live" "$ISO_STAGING/boot/grub"

VML="$(readlink -f "$CHROOT/boot/vmlinuz" 2>/dev/null || ls -1 "$CHROOT"/boot/vmlinuz-* 2>/dev/null | grep -v dbg | sort -V | tail -1)"
IRD="$(readlink -f "$CHROOT/boot/initrd.img" 2>/dev/null || ls -1 "$CHROOT"/boot/initrd.img-* 2>/dev/null | sort -V | tail -1)"
if [[ ! -f "$VML" || ! -f "$IRD" ]]; then
  echo "Could not locate kernel/initrd in chroot (vmlinuz/initrd.img)." >&2
  exit 1
fi
cp "$VML" "$ISO_STAGING/live/vmlinuz"
cp "$IRD" "$ISO_STAGING/live/initrd.img"

echo "==> Squashfs (this may take several minutes)…"
mksquashfs "$CHROOT" "$ISO_STAGING/live/filesystem.squashfs" \
  -comp xz -b 1M -noappend -no-recovery \
  -e boot/* \
  -e proc/* \
  -e sys/* \
  -e dev/* \
  -e run/* \
  -e tmp/* \
  -e mnt/* \
  -e media/* \
  -e lost+found

cat >"$ISO_STAGING/boot/grub/grub.cfg" <<'EOF'
set default=0
set timeout=5

insmod all_video
insmod gfxterm
set gfxmode=auto
terminal_output gfxterm

menuentry "GameServerOS installer (live)" {
    linux /live/vmlinuz boot=live quiet components ipv6.disable=1
    initrd /live/initrd.img
}
EOF

ISO_OUT="$OUT_DIR/gameserveros-${VERSION}-amd64.iso"
mkdir -p "$OUT_DIR"
echo "==> grub-mkrescue → $ISO_OUT"
grub-mkrescue -o "$ISO_OUT" "$ISO_STAGING" -- \
  -volid "GSOS_${VERSION}"

sha256sum "$ISO_OUT" | tee "$ISO_OUT.sha256"
echo "==> Wrote $ISO_OUT"

if [[ "$BUILD_ROOTFS_TAR" == "1" ]]; then
  TAR_OUT="$OUT_DIR/gameserveros-${VERSION}-amd64-rootfs.tar.gz"
  echo "==> Optional rootfs tarball → $TAR_OUT"
  tar -C "$CHROOT" -czf "$TAR_OUT" .
  sha256sum "$TAR_OUT" | tee "$TAR_OUT.sha256"
fi
