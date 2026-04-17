# 4B — Partition layout

All sizes are **minimums**; the **game data** partition consumes **remaining space** on the install disk.

| Mount | Role | Min size | Writable | Notes |
|-------|------|----------|----------|-------|
| `/` | OS (Debian + agent binary + configs) | 12 GiB | **Read-only** (overlay) | Upgrades refresh this layer. |
| `/var/lib/steamline` | Agent state, credentials, caches | 4 GiB | Yes | API key, `node-pty`, agent logs symlinked to `/var/log/steamline`. |
| `/var/gameserveros/games` | Game server instances (SteamCMD, instances) | 32 GiB | Yes | **Multiple instances** supported; each instance under a UUID directory. |
| `/var/gameserveros/logs` | Bounded host + agent logs | 4 GiB | Yes | **Size-capped** via `logrotate` + `journald` vacuum; aggressive retention for `steamline-*`. |
| `/var/gameserveros/backups` | Local backup destination (optional) | Remainder or 16 GiB | Yes | When user selects “local” backups in dashboard. |
| `/boot/efi` | EFI System Partition | 512 MiB | Yes (firmware only) | FAT32. |
| BIOS boot | GRUB `bios_grub` flag | 1 MiB | — | If legacy BIOS enabled. |

## LUKS (optional)

- **Encrypted:** `/var/gameserveros/games`, `/var/gameserveros/backups`, optionally `/var/lib/steamline` (passphrase required at boot for those mounts).
- **Unencrypted:** `/` still read-only overlay; ESP stays unencrypted.
- **OS/boot** stays **unencrypted** so the machine can boot unattended when the operator chooses **no** encryption.

## Dashboard “enable encryption later”

**Approach (technical):** LUKS headers can be added to a block device **in place** only with care (usually requires free space or data migration). The supported path for v1 is **installer-time choice**. A future dashboard flow would:

1. Schedule maintenance window; agent stops game servers cleanly.
2. Run validated `cryptsetup-reencrypt` / migrate-to-LUKS playbook (not shipped in v1).
3. Update `fstab`/`crypttab` and initramfs; reboot with operator passphrase.

Until that ships, the dashboard should **surface docs** and recommend **reinstall with encryption** if policy changes from “off” to “on” on bare metal.

## Next

See [BOOT-SOFTWARE.md](./BOOT-SOFTWARE.md) (4C).
