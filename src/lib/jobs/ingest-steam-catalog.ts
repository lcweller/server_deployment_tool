import { eq } from "drizzle-orm";

import { db } from "@/db";
import { catalogEntries, catalogOverrides } from "@/db/schema";
import { LAUNCH_PRESETS } from "../../../agent/launch-presets";

function slugify(name: string, appId: number) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "app"}-${appId}`;
}

type SteamApp = { appid: number; name: string };

/** Obvious non-server Steam packages — keeps the catalog usable without manual curation. */
const EXCLUDE_RE =
  /(redistributable|redist\b|\bruntime\b|\bsdk\b|directx|framework|microsoft\s|android|ios|wallpaper|soundtrack|video|trailer|ebook|comic|\bost\b|sound\s*track|documentary|java\s|python\s|node\.js|ruby\b|test\s*app|font\s|locale\s|language\s+pack)/i;

const PRIMARY_RE =
  /(dedicated(\s+server)?|game\s*server|listen\s*server|server\s+tool|server\s+files)/i;

const SECONDARY_RE = /(\bserver\b|headless|svr\b)/i;

function isServerCandidate(name: string): boolean {
  if (!name || EXCLUDE_RE.test(name)) {
    return false;
  }
  if (PRIMARY_RE.test(name)) {
    return true;
  }
  if (
    SECONDARY_RE.test(name) &&
    !/\b(client|player|viewer|browser|launcher)\b/i.test(name)
  ) {
    return true;
  }
  return false;
}

function serverSortScore(name: string): number {
  let s = 0;
  if (/dedicated/i.test(name)) {
    s += 80;
  }
  if (PRIMARY_RE.test(name)) {
    s += 60;
  }
  if (/\bgame\s*server\b/i.test(name)) {
    s += 40;
  }
  if (/\bserver\b/i.test(name)) {
    s += 25;
  }
  if (/headless/i.test(name)) {
    s += 30;
  }
  return s;
}

function loginModeForApp(appid: number, name: string): "anonymous" | "steam" {
  const key = String(appid);
  if (LAUNCH_PRESETS[key]?.requiresSteamLogin) {
    return "steam";
  }
  if (/counter-strike\s*2/i.test(name)) {
    return "steam";
  }
  return "anonymous";
}

/**
 * Pulls the public Steam app list and upserts rows that look like dedicated / server packages.
 * `maxRows` caps how many **new** high-scoring candidates are considered per run (updates still apply).
 */
export async function ingestSteamCatalog(options?: { maxRows?: number }) {
  const maxRows = Math.min(
    100_000,
    Math.max(100, options?.maxRows ?? 12_000)
  );

  const res = await fetch(
    "https://api.steampowered.com/ISteamApps/GetAppList/v2/"
  );
  if (!res.ok) {
    throw new Error(`Steam GetAppList failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    applist?: { apps?: SteamApp[] };
  };

  const apps = data.applist?.apps ?? [];
  const candidates = apps
    .filter((a) => a?.name && isServerCandidate(a.name))
    .sort(
      (a, b) =>
        serverSortScore(b.name) - serverSortScore(a.name) ||
        a.appid - b.appid
    );

  const overrideRows = await db.select().from(catalogOverrides);
  const hidden = new Set<string>();
  const boostMap = new Map<string, number>();
  for (const o of overrideRows) {
    if (o.hidden) {
      hidden.add(o.steamAppId);
    }
    boostMap.set(o.steamAppId, o.scoreBoost ?? 0);
  }

  const existingRows = await db
    .select({
      id: catalogEntries.id,
      steamAppId: catalogEntries.steamAppId,
    })
    .from(catalogEntries);
  const existingBySteam = new Map(
    existingRows.map((r) => [r.steamAppId, r.id])
  );

  let inserted = 0;
  let updated = 0;
  let skippedHidden = 0;
  /** Caps DB writes per cron run (Steam returns a very large app list). */
  const workBudget = Math.min(25_000, Math.max(2000, maxRows * 2));
  let remainingWork = workBudget;

  for (const app of candidates) {
    const steamAppId = String(app.appid);
    if (hidden.has(steamAppId)) {
      skippedHidden++;
      continue;
    }

    if (remainingWork <= 0) {
      break;
    }

    const boost = boostMap.get(steamAppId) ?? 0;
    const popularityScore = Math.min(1000, app.appid % 500 + boost);
    const existingId = existingBySteam.get(steamAppId);

    if (existingId) {
      await db
        .update(catalogEntries)
        .set({
          name: app.name,
          popularityScore,
        })
        .where(eq(catalogEntries.id, existingId));
      updated++;
      remainingWork--;
      continue;
    }

    const slug = slugify(app.name, app.appid);
    const loginMode = loginModeForApp(app.appid, app.name);
    try {
      await db.insert(catalogEntries).values({
        steamAppId,
        slug,
        name: app.name,
        template: {
          source: "steam-ingest",
          loginMode,
          defaultPorts: { game: 27_015, query: 27_016, stride: 2 },
        },
        popularityScore,
      });
      inserted++;
      remainingWork--;
    } catch {
      /* slug unique collision — rare duplicate name/appid edge */
    }
  }

  return {
    scanned: apps.length,
    candidates: candidates.length,
    maxRows,
    workBudget,
    inserted,
    updated,
    skippedHidden,
  };
}
