# GameServerOS

Custom Linux image and first-boot installer for **Steamline** — zero Linux knowledge required.

| Doc | Contents |
|-----|----------|
| [docs/BASE-OS.md](./docs/BASE-OS.md) | **4A** — Base distribution choice |
| [docs/PARTITIONING.md](./docs/PARTITIONING.md) | **4B** — Partition layout |
| [docs/BOOT-SOFTWARE.md](./docs/BOOT-SOFTWARE.md) | **4C** — Boot modes & pre-installed packages |
| [build/README.md](./build/README.md) | **4I** — Build prerequisites & artifacts |

## Layout

- `installer/` — First-boot TUI (`install-main.sh`, helpers).
- `systemd/` — Agent + OS updater units.
- `scripts/` — Hardening, updates, audit forwarding.
- `nftables/` — Default-deny template (agent opens ports as needed).
- `cloud-init/` — Optional nocloud snippets for VPS providers.
- `build/` — `build-iso.sh` (rootfs / ISO pipeline).

## Platform APIs (reverse pairing)

1. `POST /api/public/gameserveros/install-session` → `{ pairingCode, pollToken, expiresAt }`
2. Installer shows `pairingCode`; operator claims at **Hosts → Link GameServerOS** (dashboard).
3. `GET /api/public/gameserveros/install-session/status` with `Authorization: Bearer <pollToken>` → `{ status: "waiting" | "linked" | "expired" }`
4. Installer runs `install-agent.sh` / enroll with the same pairing code.
