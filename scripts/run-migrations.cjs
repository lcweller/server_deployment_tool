/**
 * Runtime DB migrations without drizzle-kit (for Docker / production).
 * Usage: DATABASE_URL=... node scripts/run-migrations.cjs
 */
const path = require("path");
const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
const { migrate } = require("drizzle-orm/postgres-js/migrator");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const migrationsFolder = path.join(__dirname, "..", "drizzle");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder });
    console.log("Migrations applied.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
