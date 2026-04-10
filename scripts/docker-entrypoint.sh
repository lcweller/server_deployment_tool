#!/bin/sh
set -e
cd /app

# Compose usually sets DATABASE_URL; Unraid "one container" templates often omit it.
# If unset but POSTGRES_PASSWORD is set, build a URL (defaults match docker-compose.stack.yml).
if [ -z "$DATABASE_URL" ] && [ -n "$POSTGRES_PASSWORD" ]; then
  _u="${POSTGRES_USER:-steamline}"
  _h="${POSTGRES_HOST:-postgres}"
  _d="${POSTGRES_DB:-steamline}"
  export DATABASE_URL="postgresql://${_u}:${POSTGRES_PASSWORD}@${_h}:5432/${_d}"
  echo "[steamline] DATABASE_URL was empty; built from POSTGRES_* (host=${_h})."
fi

if [ -z "$DATABASE_URL" ]; then
  echo "[steamline] ERROR: DATABASE_URL is required."
  echo "[steamline] Set DATABASE_URL, e.g. postgresql://USER:PASSWORD@HOST:5432/DB"
  echo "[steamline] Or set POSTGRES_PASSWORD and POSTGRES_HOST (default host: postgres) for the same compose stack."
  exit 1
fi

if [ "${RUN_MIGRATIONS_ON_START:-1}" != "0" ]; then
  echo "[steamline] Applying database migrations…"
  node scripts/run-migrations.cjs
fi
if [ "${RUN_CATALOG_SEED_ON_START:-1}" != "0" ]; then
  echo "[steamline] Ensuring default catalog entries…"
  node scripts/seed-catalog-if-empty.cjs
fi
echo "[steamline] Starting Next.js…"
exec node server.js
