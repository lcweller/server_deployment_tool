import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  steamlineSql?: ReturnType<typeof postgres>;
};

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local for local development."
    );
  }
  if (!globalForDb.steamlineSql) {
    globalForDb.steamlineSql = postgres(url, { max: 10 });
  }
  return globalForDb.steamlineSql;
}

let _db: DB | undefined;

function getDb(): DB {
  if (!_db) {
    _db = drizzle(getSql(), { schema });
  }
  return _db;
}

/** Lazy DB handle so importing this module does not require DATABASE_URL at build time. */
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, receiver);
    if (typeof value === "function") {
      return value.bind(real);
    }
    return value;
  },
});
