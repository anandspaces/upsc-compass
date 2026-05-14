import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { env } from "../config/env";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

let _client: Sql | null = null;
let _db: DB | null = null;

export function getDb(connectionString?: string): DB {
  if (_db && !connectionString) return _db;
  const url = connectionString ?? env.DATABASE_URL;
  const client = postgres(url, {
    max: env.NODE_ENV === "test" ? 5 : 20,
    idle_timeout: 30,
    prepare: false,
  });
  const db = drizzle(client, { schema });
  if (!connectionString) {
    _client = client;
    _db = db;
  }
  return db;
}

export function getClient(): Sql {
  if (!_client) getDb();
  return _client as Sql;
}

export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end({ timeout: 5 });
    _client = null;
    _db = null;
  }
}

export { schema };
