#!/bin/sh
set -e
cd /app
if [ "${RUN_MIGRATIONS_ON_START:-1}" != "0" ]; then
  echo "[steamline] Applying database migrations…"
  node scripts/run-migrations.cjs
fi
echo "[steamline] Starting Next.js…"
exec node server.js
