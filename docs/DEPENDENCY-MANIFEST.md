# GameServerOS / Steamline — dependency manifest

Runtime and libraries required on a **game host** for the bundled agent (`steamline-agent.cjs`) and SteamCMD-based servers, plus what the **control plane** needs in production.

## Control plane (this repo)

| Layer | Requirement |
|-------|-------------|
| Runtime | **Node.js 20+** (matches Next 16 / `tsx`); lockfile pins npm packages |
| Database | **PostgreSQL** (Drizzle migrations under `drizzle/`) |
| Process | **`npm run start`** → `tsx server.ts` (HTTP + agent WebSocket upgrade) |
| Email | SMTP for verification (e.g. Mailpit locally) |
| Optional | Stripe keys, Cloudflare Turnstile, `CRON_SECRET` for cron routes |

### GameServerOS **build host** (not the Next app)

| Tool | Purpose |
|------|---------|
| `debootstrap`, `sudo`, `tar` | `gameserveros/build/build-iso.sh` rootfs tarball |
| `xorriso`, `grub-*` | Optional hybrid ISO follow-up (see `gameserveros/build/README.md`) |

### npm dependencies (root `package.json`)

- **App/UI:** `next`, `react`, `react-dom`, `@base-ui/react`, `tailwind-merge`, `clsx`, `class-variance-authority`, `lucide-react`, `tw-animate-css`, `react-qr-code`
- **Docs (in-app):** `marked` (Markdown → HTML for `/docs/*` pages)
- **Data:** `drizzle-orm`, `postgres`, `zod`
- **Auth / billing:** `bcryptjs`, `@marsidev/react-turnstile`, `stripe`, `nodemailer`
- **Agent bundle / server:** `commander`, `ws`, `tsx`, `esbuild` (build)
- **CLI:** `shadcn` (scaffolding)

## Agent host (Linux — typical production path)

### Always required

| Component | Purpose |
|-----------|---------|
| **Node.js 18+** | Executes `steamline-agent.cjs` (bundle target `node18`) |
| **Kernel + glibc** | SteamCMD and many games require glibc (not musl-only) |
| **bash**, **curl** | Bootstrap via `install-agent.sh` |
| **OpenSSL** (or compatible) | Install script may set Linux root password; TLS to platform |

### Often auto-installed by `install-agent.sh` / agent (Debian/Ubuntu-style)

- `bash`, `curl`, `ca-certificates`, `sudo`, `dmidecode`, `tar`, `gzip`
- **i386** arch + **libc6-i386**, **lib32gcc-s1** / **lib32stdc++6** / **lib32z1** (SteamCMD)

### Optional / feature-dependent

| Binary / path | Feature |
|---------------|---------|
| `dmidecode` (+ root or `sudo -n`) | RAM DIMM inventory |
| `systemd-detect-virt` | VM/container detection |
| `nvidia-smi` | NVIDIA GPU telemetry |
| `/sys/class/drm`, `/sys/class/thermal`, `/proc/diskstats`, `/proc/net/dev` | GPU/thermal/disk/net metrics (no extra package) |
| `firewall-cmd` / `firewalld` | Linux firewall (see `agent/linux-firewall.ts`) |
| `steamcmd` or downloaded SteamCMD | Provisioning (see `agent/steamcmd-bootstrap.ts`) |

### Windows / macOS agent dev

- **Windows:** PowerShell scripts; WSL for Linux-like behavior where documented
- **macOS:** Node + curl; firewall path differs (`agent/windows-firewall.ts` vs Linux)

## Network

- **Outbound HTTPS (443)** to the dashboard origin (agent enroll, heartbeat, REST, WebSocket `wss`)
- **Outbound** to Steam CDN / metadata services for SteamCMD and games
- **Inbound** game ports only as opened by the agent when servers run

## Version pin

- Agent reports `steamline-agent/0.1.0` in enroll/heartbeat until a formal version pipeline replaces it (see product roadmap).
