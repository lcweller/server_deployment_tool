/**
 * Idempotent catalog seed for production Docker (no tsx). Run after migrations.
 */
const postgres = require("postgres");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[steamline] DATABASE_URL is required for catalog seed");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });

  try {
    const rows = await sql`
      SELECT count(*)::int AS c FROM catalog_entries
    `;
    const c = rows[0]?.c ?? 0;
    if (c > 0) {
      console.log("[steamline] Catalog already has entries; skip seed.");
      return;
    }

    const t1 = {
      description:
        "Placeholder template for classic SRCDS-style titles; verify App ID and launch flags before production.",
      loginMode: "anonymous",
    };
    const t2 = {
      description:
        "Example row for popularity sorting UI; confirm SteamCMD login mode for this title.",
      loginMode: "unknown",
    };

    await sql`
      INSERT INTO catalog_entries (steam_app_id, slug, name, template, popularity_score)
      VALUES
        ('90', 'hlds-example', 'Half-Life Dedicated Server (example template)', ${sql.json(
          t1
        )}, 100),
        ('380870', 'project-zomboid-example', 'Project Zomboid Dedicated (example)', ${sql.json(
          t2
        )}, 85)
    `;
    console.log("[steamline] Seeded default catalog entries.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
