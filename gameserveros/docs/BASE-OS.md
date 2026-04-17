# 4A — Base OS selection

## Choice: **Debian 12 (Bookworm)** — amd64

### Why Debian

1. **Lightweight** — Minimal install + your package set stays small; no mandatory desktop stack.
2. **Secure** — Predictable security updates, mature signing, broad CVE coverage.
3. **Fast** — Stock kernel, good I/O defaults; no extra abstraction vs. full desktop distros.
4. **SteamCMD compatible** — **glibc**-based userspace (i386 multiarch supported). **Alpine/musl is unsuitable** for official SteamCMD binaries.
5. **Customizable** — debootstrap/mmdebstrap, live hooks, reproducible chroots.
6. **Immutability options** — `overlayroot` / read-only root + writable overlays (see PARTITIONING.md); A/B `ostree` is a future upgrade path.

## Immutable root

- **Target:** Root filesystem **read-only** at runtime with **writable overlays** (or separate writable partitions) for `/etc` deltas where required.
- **Installer:** Applies layout so `/` OS is not casually modified; game data and agent state live on dedicated writable volumes.
- **User impact:** OS updates replace or refresh the image layer; users cannot “apt install” random packages onto the root without elevated tooling (intentional).

## SSH

- **`openssh-server` is not installed** on the image.
- **`sshd.service` is masked** (`systemctl mask ssh`) so accidental enable is blocked.
- Remote access is via the **dashboard** (agent WebSocket terminal), not SSH.

## IPv4 only

- **Kernel:** `ipv6.disable=1` on the kernel command line (GRUB).
- **Userspace:** `sysctl` disables IPv6 addresses on interfaces (templates in `config/sysctl/` and `scripts/apply-os-hardening.sh`).

## Next

See [PARTITIONING.md](./PARTITIONING.md) (4B).
