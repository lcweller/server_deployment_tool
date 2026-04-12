# Steamline

Web control plane for **Steam dedicated servers**: sign up, verify email, pair **Linux agents**, browse the **catalog** (seed + Steam ingest), push **logs** from agents, and optionally bill with **Stripe**.

## Deployment model

**Only the platform operator** (you) deploys this Next.js app, database, and infrastructure. **Everyone else uses the hosted app to deploy game servers** — they sign in at your URL, add hosts, pick titles from the catalog, and run the **one-line agent installer** on **their own machines** so Steamline can install and run those servers for them. They do not clone this repo or host the control plane.

## Stack

- **Next.js 16** · **PostgreSQL** · **Drizzle ORM**
- **Auth:** bcrypt + DB sessions + **Cloudflare Turnstile** + **SMTP** verification mail
- **Agent:** CLI in `agent/cli.ts` — enroll, heartbeat, **run** = deletion queue + **start/stop** power lifecycle + **watchdog** (auto-restart dead dedicated processes with backoff, status **`recovering`**) + host teardown + provision (downloads **SteamCMD** on first use; stub only if `STEAMLINE_PROVISION_STUB=1`). Disable the watchdog with **`STEAMLINE_WATCHDOG_DISABLE=1`** on the host if needed. Production builds bundle a single **`steamline-agent.cjs`** (see `npm run agent:bundle`) served from the dashboard so hosts can **`curl …/install-agent.sh | bash`** without cloning the repo.
- **Billing:** Stripe Checkout + Customer Portal + webhooks
- **Jobs:** `GET /api/cron/catalog-ingest` and `GET /api/cron/prune-logs` (Bearer `CRON_SECRET`)

## Quick start

**If you are new to this stack**, use the automated script (starts Docker services, runs migrations, seeds the DB):

1. **Start Docker Desktop** (Windows/macOS) and wait until the engine is running.
2. In the project folder, run:

```bash
npm run setup:local
```

That reads `.env.local` (create it first, or copy from `.env.example`). A starter `.env.local` may already exist with `DATABASE_URL` and `CRON_SECRET` filled in for local Docker.

3. Start the app:

```bash
npm run dev
```

**Manual equivalent:**

```bash
docker compose up -d postgres mailpit
cp .env.example .env.local
# edit .env.local — set APP_PUBLIC_URL, optional Turnstile keys

npx drizzle-kit migrate
npm run db:seed
npm run dev
```

1. Open http://localhost:3000 — **Register** (use Mailpit http://localhost:8025 to read the verification link if SMTP points to Mailpit).
2. After verifying, open **Hosts** → **Add host** (wizard: name → OS → copy enroll command).
3. On the target machine (Linux, macOS, or WSL): run the copied **one-line** command (requires **Node.js 18+** and **curl**). It downloads **`steamline-agent.cjs`**, enrolls, and writes **`~/.steamline/steamline-agent.env`**. The wizard detects enrollment automatically; open the host for full details.
4. On the host, start the loop: **`cd ~/.steamline && node steamline-agent.cjs run <API_URL>`** (or from a dev clone: **`npm run agent:run`** on Windows, **`npm run agent -- run <URL>`** with the repo). That loop **heartbeats**, applies **Stop**/**Start** from the dashboard (`stopping`/`stopped`/`starting`/`running`), and **provisions** new servers (`queued` → `installing` → `running`).
5. Optional: `npm run catalog:ingest:local` (with `npm run dev` running) to pull Steam titles into the catalog.
6. Open **Servers** → create an instance (catalog + enrolled host), or **Catalog** → **Deploy to host**. Watch status update as the agent runs.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build (runs **`agent:bundle`** first — emits `public/steamline-agent.cjs`) |
| `npm run agent:bundle` | Bundle agent to `public/steamline-agent.cjs` for host installs |
| `npm run db:migrate` | Apply SQL migrations |
| `npm run db:seed` | Seed demo catalog rows |
| `npm run catalog:ingest:local` | Call catalog ingest using `CRON_SECRET` from `.env.local` (app must be up) |
| `npm run agent:run` | **Windows:** creates `steamline-agent.env` if needed, then starts `agent run` |
| `npm run agent -- …` | Agent CLI (`enroll`, `heartbeat`, `run`, `instances`, `ack`) |

## Deploy (Docker / Unraid / GHCR)

Push to GitHub → **Actions** builds and pushes **`ghcr.io/<user>/<repo>:latest`**. On Unraid, use **`docker-compose.stack.yml`** + `.env` (see **[docs/DEPLOY-UNRAID.md](docs/DEPLOY-UNRAID.md)**). Pull a new image and recreate the container to update.

The container entrypoint applies migrations, then **seeds starter catalog rows** if `catalog_entries` is empty (`RUN_CATALOG_SEED_ON_START`, default on). Agents send **CPU / RAM / disk** metrics with each heartbeat (`host_metrics` column).

## Cron jobs (operator deployment)

Call periodically (e.g. Unraid user script + `curl`):

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "$APP_PUBLIC_URL/api/cron/catalog-ingest"

curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "$APP_PUBLIC_URL/api/cron/prune-logs"
```

## Stripe

1. Create product + recurring price in Stripe Dashboard → set `STRIPE_PRICE_ID`.
2. Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and point webhook to `/api/webhooks/stripe` (events: `customer.subscription.*`).
3. Users open **Billing** → Checkout; portal requires an existing Stripe customer (after checkout).

## Remote provisioning (game hosts)

**End users** (your customers) only use the **hosted dashboard** and run the **one-line install** on their game machine — they do not clone this repository.

1. **Enroll (normal path):** **Add host** → copy the command from the UI. Example (your public URL):

   ```bash
   curl -fsSL "https://game.layeroneconstultants.com/install-agent.sh" | sudo bash -s -- "https://game.layeroneconstultants.com" "<ENROLLMENT_TOKEN>"
   ```

   That writes **`~/.steamline/steamline-agent.env`**. **Operator/dev only:** you can also run **`npm run agent -- enroll <URL> <TOKEN>`** from this repo when debugging the agent.

2. **Run loop:** on the host, **`cd ~/.steamline && node steamline-agent.cjs run https://game.layeroneconstultants.com`** (the installer starts this in the background). Leave it running (systemd, tmux, etc.).

**Windows agent development (operator clone only):** from this repo:

```powershell
npm run agent:run
```

The first time, it creates **`steamline-agent.env`**. Paste the **`apiKey`** from enroll output, save, run again. Uses **`APP_PUBLIC_URL`** from `.env.local` or defaults to `http://localhost:3000`.

**Manual:** set `STEAMLINE_API_KEY` and run `npm run agent -- run "<URL>"`, or use **`steamline-agent.env.example`**.

3. Create servers in **Servers**; they start as **`queued`**. The agent loop provisions one per cycle: **`queued` → `installing` → `running`** (or **`failed`**). For a **running** server, **Stop** in the UI moves it to **`stopped`** (process ended, firewall/UPnP cleared, files kept); **Start** brings it back without re-running SteamCMD. When the host reports a **public IPv4**, the deploy playbook includes **Test connection from the internet** (TCP reachability from the app server — UDP-heavy games may still show “closed” while players can join).

**Provisioning (on the host):**

| Env | Behavior |
|-----|----------|
| _(default)_ | Downloads SteamCMD into `steamline-data/.cache/steamcmd` if missing, then runs `app_update` for the catalog Steam App ID (anonymous login unless the title requires a licensed account — see host page **Steam licensed installs**). Install dir: `./steamline-data/instances/<id>` or `STEAMLINE_INSTANCE_ROOT`. |
| `STEAMLINE_PROVISION_STUB=1` | Skips real SteamCMD; marks **`running`** with a stub message (dev only). |

Optional: `STEAMLINE_STEAMCMD_PATH` to use an existing SteamCMD binary; `STEAMLINE_DATA_ROOT` / `STEAMLINE_INSTANCE_ROOT` for data locations.

**Licensed SteamCMD:** on the host detail page use **Push to host** — credentials are encrypted briefly on the server, delivered once to the enrolled agent over HTTPS, then removed from the database while the agent writes `~/.steamline/steamline-agent.env`. Advanced operators can still set `STEAMLINE_STEAM_*` manually or run `steam-login`. Configure `STEAMLINE_HOST_STEAM_SECRET` (or a long `AUTH_SECRET`) for the encryption key.

**Dedicated process (optional):** After a successful SteamCMD install, set **`STEAMLINE_AFTER_INSTALL_CMD`** to a shell command run in the instance install directory (e.g. start your dedicated server). The agent spawns it detached and writes **`steamline.pid`** so dashboard **Stop** / **Delete** can stop the process (Delete also removes files).

**Deletion:** In the UI, **Delete** on a server sets **`pending_delete`**; the agent removes files, calls **`purge-complete`**, and the row disappears. **Remove host** sets instances to **`pending_delete`** and the host to **`pending_removal`**; after the agent wipes data it runs **`STEAMLINE_UNINSTALL_SCRIPT`** (if set), deletes **`steamline-data`** (or **`STEAMLINE_DATA_ROOT`**), then calls **`removal-complete`** so API keys and the host row are removed.

Apply DB migration **`0004_instance_provision_fields`** (`npm run db:migrate`).

## Agent API (summary)

| Endpoint | Auth |
|----------|------|
| `POST /api/v1/agent/enroll` | One-time `enrollmentToken` in JSON |
| `POST /api/v1/agent/heartbeat` | Bearer — promotes legacy `draft` → `queued` on this host |
| `GET /api/v1/agent/instances` | Bearer — instances assigned to this host |
| `GET /api/v1/agent/host` | Bearer — current host id / status |
| `POST /api/v1/agent/instances/:instanceId/status` | Bearer — body `{ "status": "installing" \| "running" \| "failed", "message"?: "…" }` |
| `POST /api/v1/agent/instances/:instanceId/purge-complete` | Bearer — after local wipe; removes DB row when status is `pending_delete` |
| `POST /api/v1/agent/host/removal-complete` | Bearer — after uninstall + data wipe; removes host + API keys when status is `pending_removal` and no instances remain |
| `POST /api/v1/agent/instances/:instanceId/ack` | Bearer — `draft` → `queued` |
| `POST /api/v1/agent/instances/:instanceId/logs` | Bearer; body `{ "lines": ["…"] }` |
| `GET /api/instances/:instanceId/logs/stream` | Browser session (owner) — SSE |

Control plane: `GET/POST /api/instances` (session) — create/list game server rows for your account.

## Design

UI patterns: dark, calm dashboard — see [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md).

## License

Private until you add one.
