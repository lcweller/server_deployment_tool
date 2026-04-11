import { eq } from "drizzle-orm";

import { db } from "@/db";
import { catalogEntries, catalogOverrides } from "@/db/schema";

function slugify(name: string, appId: number) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "app"}-${appId}`;
}

const DEDICATED_RE = /dedicated|server/i;

type SteamApp = { appid: number; name: string };

/**
 * Pulls the public app list and upserts rows that look like dedicated servers.
 */
export async function ingestSteamCatalog(options?: { maxRows?: number }) {
  const maxRows = options?.maxRows ?? 400;

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
  const candidates = apps.filter(
    (a) => a?.name && DEDICATED_RE.test(a.name)
  );

  const hiddenRows = await db
    .select({ id: catalogOverrides.steamAppId })
    .from(catalogOverrides)
    .where(eq(catalogOverrides.hidden, true));
  const hidden = new Set(hiddenRows.map((r) => r.id));

  let inserted = 0;
  let updated = 0;

  for (const app of candidates.slice(0, maxRows)) {
    const steamAppId = String(app.appid);
    if (hidden.has(steamAppId)) {
      continue;
    }

    const boostRows = await db
      .select()
      .from(catalogOverrides)
      .where(eq(catalogOverrides.steamAppId, steamAppId))
      .limit(1);
    const boost = boostRows[0]?.scoreBoost ?? 0;
    const popularityScore = Math.min(1000, app.appid % 500 + boost);

    const existing = await db
      .select()
      .from(catalogEntries)
      .where(eq(catalogEntries.steamAppId, steamAppId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(catalogEntries)
        .set({
          name: app.name,
          popularityScore,
        })
        .where(eq(catalogEntries.id, existing[0].id));
      updated++;
      continue;
    }

    const slug = slugify(app.name, app.appid);
    try {
      await db.insert(catalogEntries).values({
        steamAppId,
        slug,
        name: app.name,
        template: {
          source: "steam-ingest",
          loginMode: "unknown",
          defaultPorts: { game: 27_015, query: 27_016, stride: 2 },
        },
        popularityScore,
      });
      inserted++;
    } catch {
      /* slug unique collision */
    }
  }

  return {
    scanned: apps.length,
    candidates: candidates.length,
    inserted,
    updated,
  };
}
