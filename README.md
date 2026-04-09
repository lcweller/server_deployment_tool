# Steamline

Web control plane for **Steam dedicated servers**: sign up, verify email, pair **Linux agents**, browse the **catalog** (seed + Steam ingest), push **logs** from agents, and optionally bill with **Stripe**.

## Stack

- **Next.js 16** · **PostgreSQL** · **Drizzle ORM**
- **Auth:** bcrypt + DB sessions + **Cloudflare Turnstile** + **SMTP** verification mail
- **Agent:** CLI in `agent/cli.ts` — enroll, heartbeat, **run** = deletion queue + host teardown + provision (downloads **SteamCMD** on first use; stub only if `STEAMLINE_PROVISION_STUB=1`)
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
3. On the target machine (Linux, macOS dev, or WSL): run the copied command from the Steamline project directory. The wizard detects enrollment automatically; open the host for full details.
4. On the host, run **`npm run agent:run`** (Windows) or **`npm run agent -- run http://localhost:3000`** after setting the key. First run creates **`steamline-agent.env`** — paste the enroll **`apiKey`** there, save, run again. That loop **heartbeats** and **provisions** UI servers (`queued` → `installing` → `running`).
5. Optional: `npm run catalog:ingest:local` (with `npm run dev` running) to pull Steam titles into the catalog.
6. Open **Servers** → create an instance (catalog + enrolled host), or **Catalog** → **Deploy to host**. Watch status update as the agent runs.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run db:migrate` | Apply SQL migrations |
| `npm run db:seed` | Seed demo catalog rows |
| `npm run catalog:ingest:local` | Call catalog ingest using `CRON_SECRET` from `.env.local` (app must be up) |
| `npm run agent:run` | **Windows:** creates `steamline-agent.env` if needed, then starts `agent run` |
| `npm run agent -- …` | Agent CLI (`enroll`, `heartbeat`, `run`, `instances`, `ack`) |

## Deploy (Docker / Unraid / GHCR)

Push to GitHub → **Actions** builds and pushes **`ghcr.io/<user>/<repo>:latest`**. On Unraid, use **`docker-compose.stack.yml`** + `.env` (see **[docs/DEPLOY-UNRAID.md](docs/DEPLOY-UNRAID.md)**). Pull a new image and recreate the container to update.

## Cron (self-hosted)

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

## Remote provisioning (host)

1. Enroll the host and set `STEAMLINE_API_KEY` (the **real** key from the enroll JSON — not the literal characters `…`).
2. Run **`npm run agent -- run <API_URL>`** on the host and leave it running (systemd, tmux, or Task Scheduler).

**Windows (easiest):** from the project folder run:

```powershell
npm run agent:run
```

The first time, it creates **`steamline-agent.env`**. Open that file, paste the **`apiKey`** from the enroll JSON after the `=` sign, save, then run **`npm run agent:run`** again. The script reads **`APP_PUBLIC_URL`** from `.env.local` or defaults to `http://localhost:3000`.

**Manual (any shell):** set `STEAMLINE_API_KEY` and run `npm run agent -- run "<URL>"`, or put the key in **`steamline-agent.env`** (see `steamline-agent.env.example`).
3. Create servers in **Servers**; they start as **`queued`**. The agent loop provisions one per cycle: **`queued` → `installing` → `running`** (or **`failed`**).

**Provisioning (on the host):**

| Env | Behavior |
|-----|----------|
| _(default)_ | Downloads SteamCMD into `steamline-data/.cache/steamcmd` if missing, then runs it with anonymous login + `app_update` for the catalog Steam App ID. Install dir: `./steamline-data/instances/<id>` or `STEAMLINE_INSTANCE_ROOT`. |
| `STEAMLINE_PROVISION_STUB=1` | Skips real SteamCMD; marks **`running`** with a stub message (dev only). |

Optional: `STEAMLINE_STEAMCMD_PATH` to use an existing SteamCMD binary; `STEAMLINE_DATA_ROOT` / `STEAMLINE_INSTANCE_ROOT` for data locations.

**Dedicated process (optional):** After a successful SteamCMD install, set **`STEAMLINE_AFTER_INSTALL_CMD`** to a shell command run in the instance install directory (e.g. start your dedicated server). The agent spawns it detached and writes **`steamline.pid`** so dashboard **Delete** can stop the process before removing files.

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
