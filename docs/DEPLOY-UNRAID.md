# Deploy Steamline on Unraid (Docker + GitHub)

This guide is for the **platform operator** only — the person who hosts Steamline for everyone else. End users never follow these steps; they only use your public URL and run the agent on their game servers.

It assumes you push this repo to **GitHub** and use the included workflow to build and publish the image to **GitHub Container Registry (GHCR)**.

## 1. GitHub: build and publish

1. Create a repository on GitHub and push this codebase (`main` or `master`).
2. Open **Actions** → enable workflows if prompted.
3. On each push to `main`/`master`, **Docker build and push** builds the image and pushes to:

   `ghcr.io/<your-github-user-or-org>/<repo-name>:latest`

   Tags also include branch names and `sha-*` for traceability.

4. **Package visibility:** In GitHub → **Packages** → your container image → **Package settings** → set visibility to **Public** (or stay private and log in on Unraid with a PAT that has `read:packages`).

5. **Manual run:** **Actions** → **Docker build and push** → **Run workflow**.

## 2. What you need before going public

| Variable | Purpose |
|----------|---------|
| `APP_PUBLIC_URL` | Full public URL with scheme, no trailing slash (e.g. `https://game.layeroneconstultants.com`). Used for email links, Stripe redirects, and agent install commands. |
| `CRON_SECRET` | Long random string; protect `/api/cron/*` calls. |
| `DATABASE_URL` | Handled for you if you use `docker-compose.stack.yml` (Postgres service). |
| Email (optional) | `SMTP_*` for verification mail. Self-hosted [Docker-Mailserver + Steamline](SMTP-DOCKER-MAILSERVER.md). |
| Turnstile (recommended for **public** sites) | **`TURNSTILE_SITE_KEY`** + **`TURNSTILE_SECRET_KEY`** at container runtime (pre-built images ignore `NEXT_PUBLIC_*` unless you rebuild). For **private/LAN** only, `STEAMLINE_SKIP_TURNSTILE=1` (never on a public URL). |
| Stripe (optional) | `STRIPE_*` if you use billing. |

## 3. Unraid: run with Docker Compose (recommended)

1. Install the **Community Applications** plugin if you use templates; Compose is available on recent Unraid versions or via the **Compose** plugin.
2. On your server, clone or copy the repo (or at least `docker-compose.stack.yml`).
3. Create `.env` next to the compose file (see `.env.example` in the repo). Set at minimum:

   - `APP_PUBLIC_URL=https://game.layeroneconstultants.com`
   - `CRON_SECRET=...`
   - `POSTGRES_PASSWORD=...` (strong password)
   - `STEAMLINE_IMAGE=ghcr.io/youruser/steam-server-dashboard:latest` (must match the GHCR path from Actions; **lowercase**)
   - `STEAMLINE_HTTP_PORT=3000` (or another host port)

4. Start:

   ```bash
   docker compose -f docker-compose.stack.yml --env-file .env up -d
   ```

5. Migrations run on app startup when `RUN_MIGRATIONS_ON_START=1` (default).

## 4. Unraid: single “Add Container” (UI only)

If you prefer the Docker UI without Compose:

1. **Add Container** → **Advanced view**.
2. **Repository:** `ghcr.io/youruser/steam-server-dashboard:latest`
3. Add **extra parameter** → **Port** `3000:3000` (or map host `80`/`443` via reverse proxy).
4. Add **Environment variables** matching what `docker-compose.stack.yml` passes to `app` (you still need a **Postgres** container and `DATABASE_URL` pointing to it, e.g. `postgresql://user:pass@steamline-postgres:5432/steamline` on a custom network).

Compose is simpler because Postgres + app + healthchecks are defined together.

### “DATABASE_URL is required” / container exits after migrations

The app **must** connect to PostgreSQL before it starts.

- **Docker Compose (`docker-compose.stack.yml`):** Compose should pass `DATABASE_URL` automatically from `POSTGRES_*`. If it is still empty, your `.env` may not be loaded — use  
  `docker compose -f docker-compose.stack.yml --env-file .env up -d`  
  and ensure `POSTGRES_PASSWORD` is set (see `.env.example`).

- **Unraid “Add Container” only:** You must add **`DATABASE_URL`** yourself. Use your Postgres user, password, database name, and a **reachable host**:
  - If Postgres is another container with a **published port** on Unraid (e.g. `5432` on the server), use your **Unraid LAN IP**:  
    `postgresql://steamline:YOUR_PASSWORD@192.168.1.50:5432/steamline`
  - If both containers share a **custom Docker network** and the DB container is named `steamline-postgres`, you can use that **container name** as the host instead of an IP.

Passwords with special characters (`@`, `:`, `#`, etc.) must be **URL-encoded** inside `DATABASE_URL`.

Images **after** the entrypoint update can also set only **`POSTGRES_PASSWORD`** (and optionally **`POSTGRES_USER`**, **`POSTGRES_DB`**, **`POSTGRES_HOST`**) and the container will build `DATABASE_URL` on startup when `DATABASE_URL` itself is empty.

## 5. HTTPS and public URL

Point a DNS A/AAAA record at your Unraid public IP. Put **Nginx Proxy Manager**, **SWAG**, or another reverse proxy in front of port 3000, issue TLS certs, and set `APP_PUBLIC_URL` to the **https** URL.

## 6. Updates (force new container)

After each `git push` to `main`, GitHub Actions publishes a new `:latest` (and other tags).

On Unraid:

```bash
cd /path/to/compose
docker compose -f docker-compose.stack.yml pull app
docker compose -f docker-compose.stack.yml --env-file .env up -d
```

Or from Docker UI: **Check for updates** → **Apply update** if your template tracks `:latest`.

## 7. Smoke test locally (optional)

On a dev machine with Docker:

```powershell
npm run verify:smoke
```

That runs `npm run build`, optional migrations against `DATABASE_URL`, and `docker build -t steamline:local .`.

## 8. Game agents (Linux hosts)

The **dashboard** container does not run SteamCMD for your players’ servers. Dedicated hosts still run the **agent** from this repo (or a packaged agent) with `STEAMLINE_API_KEY`, pointed at your public `APP_PUBLIC_URL`.
