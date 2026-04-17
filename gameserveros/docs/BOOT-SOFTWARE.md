# 4C — Boot mode & pre-installed software

## Boot: **UEFI + legacy BIOS (hybrid)**

- **Why both:** Bare metal firmware varies (older boards, some VPS “ISO” loaders); hybrid MBR+GPT images maximize “boots everywhere.”
- **If we ever drop BIOS:** Only when analytics show &lt;1% BIOS-only hosts; until then **dual** is default.

## Pre-installed (image / first-boot)

| Category | Packages / artifacts |
|----------|----------------------|
| **Runtime** | `systemd`, `dbus`, `ca-certificates`, `curl`, `jq`, `dialog`, `whiptail`, `newt0.52` (for mouse-capable TUI where available), `bsdutils`, `procps`, `less` |
| **Node** | **Node.js 20 LTS** (nodesource or distro backports) — agent requires **18+** |
| **Agent** | `public/steamline-agent.cjs` copied to `/opt/steamline/steamline-agent.cjs` + `install-agent.sh` hooks |
| **Telemetry** | `dmidecode`, `pciutils`, `usbutils`, `smartmontools` (optional), `lm-sensors`, `lsblk`, `util-linux` |
| **SteamCMD deps** | `libc6-i386`, multiarch; `lib32gcc-s1`, `lib32stdc++6`, `lib32z1`, `lib32z1-dev` (as needed), `bash`, `ca-certificates` |
| **Security** | `nftables`, `apparmor`, `apparmor-utils`, `auditd`, `debsecan` (optional) |
| **No SSH server** | **`openssh-server` absent**; **`sshd` masked** |

## Config overlay

- **`config/sysctl/99-gameserveros-hardening.conf`** → `/etc/sysctl.d/`
- **`config/apparmor/*`** → `/etc/apparmor.d/` + `aa-enforce` where profiles exist
- **`gameserveros/nftables/99-gameserveros-nftables.nft`** — default deny; agent opens game ports dynamically

## Next

Implement **4D** in `installer/install-main.sh`, **4E** in `systemd/steamline-agent.service`.
