# GameServerOS build

This directory builds a **hybrid UEFI + legacy BIOS** installer image (ISO 9660) from Debian bookworm using `debootstrap`, a squashfs live root, and `grub-mkrescue` (xorriso backend).

## Prerequisites (build host)

Use **Debian or Ubuntu amd64** with `sudo`.

Required packages:

- `debootstrap`
- `xorriso` (pulled in with GRUB ISO tooling; used by `grub-mkrescue`)
- `squashfs-tools` (`mksquashfs`)
- `grub-common`, `grub-pc-bin`, `grub-efi-amd64-bin`
- `mtools`, `dosfstools`
- `tar`, `curl`, `jq` (usually present)

Example:

```bash
sudo apt-get update -y
sudo apt-get install -y debootstrap xorriso squashfs-tools grub-common grub-pc-bin grub-efi-amd64-bin mtools dosfstools tar curl jq
```

Agent bundle: from the repository root, run `npm run agent:bundle` so `public/steamline-agent.cjs` exists (CI does this automatically).

## One command (produces the ISO)

From the **repository root**:

```bash
chmod +x gameserveros/build/build-iso.sh gameserveros/build/stage-vendor.sh
sudo GAMESERVEROS_VERSION=0.1.0 bash gameserveros/build/build-iso.sh
```

## Output

- **Primary:** `dist/gameserveros-${GAMESERVEROS_VERSION}-amd64.iso` — bootable hybrid image (USB / virtual CD / provider custom ISO).
- **Checksum:** `dist/gameserveros-${GAMESERVEROS_VERSION}-amd64.iso.sha256`

Optional rootfs tarball (same layout as the squashfs source tree):

```bash
sudo GAMESERVEROS_VERSION=0.1.0 GAMESERVEROS_BUILD_ROOTFS_TAR=1 bash gameserveros/build/build-iso.sh
```

Adds `dist/gameserveros-${VERSION}-amd64-rootfs.tar.gz` and `.sha256`.

## How to test in VirtualBox

1. Create a new VM: **Linux → Debian (64-bit)**, **2 GB RAM**, **2 CPUs**, **20 GB** SATA virtual disk.
2. Storage → **Empty** optical drive → choose the built ISO (`dist/gameserveros-*-amd64.iso`).
3. Boot the VM. GRUB should show **GameServerOS installer (live)**; the kernel cmdline includes **`boot=live`**.
4. Confirm the **TUI installer** starts on the console after networking is up.
5. Complete the steps (internet check, dashboard URL, pairing code, server name, timezone, encryption choice, update policy). On the target disk step, pick the empty virtual disk (the installer hides the live medium when it can be detected).
6. When installation finishes, **detach the ISO** (or remove the “live” boot medium) and reset; the VM should boot from disk into the installed OS **without** re-running the installer (`/etc/gameserveros/install-done` on the target).

## Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `GAMESERVEROS_VERSION` | `0.1.0` | Version string in filenames |
| `GAMESERVEROS_CODENAME` | `bookworm` | Debian release |
| `GAMESERVEROS_MIRROR` | `http://deb.debian.org/debian` | Package mirror |
| `GAMESERVEROS_BUILD_ROOTFS_TAR` | `0` | Set to `1` to also emit a `.tar.gz` rootfs |
| `AGENT_SRC` | `public/steamline-agent.cjs` | Agent bundle path |
| `WORKDIR` | `./.gameserveros-build` under cwd | Scratch directory for chroot and ISO staging |
