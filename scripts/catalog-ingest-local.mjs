/**
 * Calls GET /api/cron/catalog-ingest with CRON_SECRET from .env.local / .env.
 * Requires the dev server (or production) to be reachable at APP_PUBLIC_URL.
 *
 * Usage: node scripts/catalog-ingest-local.mjs
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function loadEnvFile(file) {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) {
    return;
  }
  const text = readFileSync(p, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const base = (process.env.APP_PUBLIC_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("CRON_SECRET is missing in .env.local (see .env.example).");
  process.exit(1);
}

const url = `${base}/api/cron/catalog-ingest?token=${encodeURIComponent(secret)}`;
const res = await fetch(url);
const body = await res.text();
console.log(res.status, body);
if (!res.ok) {
  process.exit(1);
}
