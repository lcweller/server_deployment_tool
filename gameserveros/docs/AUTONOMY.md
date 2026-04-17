# 4H — Self-healing & autonomy (platform + OS)

## Game server process

- **Watchdog** in `agent/watchdog.ts`: if a `running` / `recovering` instance loses its tracked PID, the agent tears down networking, restarts the dedicated server with bounded backoff, and posts status to the dashboard.
- **Configurable limit:** default **5** failed restart attempts before `failed` (see `MAX_FAILURES` in the watchdog module).

## OS updates (GameServerOS)

- `gameserveros/scripts/gameserveros-updater.sh` checks **running game servers** via `GET /api/v1/agent/instances` before `apt-get upgrade` and **skips** the upgrade cycle if any instance is `running`, `starting`, or `recovering`.
- **Manual** mode skips unless `RUN_MANUAL_OS_UPDATE=1` is set (for a future dashboard trigger).

## Network loss

- The agent **does not stop game servers** when the control plane is unreachable; it retries WebSocket / REST heartbeats and continues local supervision (watchdog, firewall reconciliation as designed).

## Disk space

- Dashboard notifications for **disk pressure** are emitted from heartbeats (`disk_low_10` / `disk_low_5`). Optional log vacuum is documented in `gameserveros/scripts/` for future hooks.

## Operator messaging

- User-visible notifications use **plain English**; technical detail goes to logs (`/var/log/gameserveros-install.log`, journald).
