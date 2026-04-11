/**
 * Seed demo catalog rows. Run after migrations:
 *   DATABASE_URL=... npx tsx src/db/seed.ts
 */
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { catalogEntries } from "./schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  const [{ value: n }] = await db
    .select({ value: count() })
    .from(catalogEntries);

  if (n > 0) {
    console.log("Catalog already has entries, skipping seed.");
    await client.end();
    return;
  }

  await db.insert(catalogEntries).values([
    {
      steamAppId: "90",
      slug: "hlds-example",
      name: "Half-Life Dedicated Server (example template)",
      template: {
        description:
          "Placeholder template for classic SRCDS-style titles; verify App ID and launch flags before production.",
        loginMode: "anonymous",
        defaultPorts: { game: 27015, query: 27016, stride: 2 },
        afterInstallCmd:
          'node -e "console.log(\\"[steamline] catalog hook\\", process.env.STEAMLINE_GAME_PORT); process.exit(0);"',
      },
      popularityScore: 100,
    },
    {
      steamAppId: "380870",
      slug: "project-zomboid-example",
      name: "Project Zomboid Dedicated (example)",
      template: {
        description:
          "Example row for popularity sorting UI; confirm SteamCMD login mode for this title.",
        loginMode: "unknown",
        defaultPorts: { game: 16261, query: 16262, stride: 2 },
        afterInstallCmd:
          'node -e "console.log(\\"[steamline] catalog hook\\", process.env.STEAMLINE_GAME_PORT); process.exit(0);"',
      },
      popularityScore: 85,
    },
  ]);

  console.log("Seeded catalog_entries.");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
