import "./test-env";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../src/db/schema";

const TEST_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!TEST_URL) throw new Error("TEST_DATABASE_URL or DATABASE_URL is required for tests");

const client = postgres(TEST_URL, { max: 5, prepare: false });
export const testDb = drizzle(client, { schema });

export async function setupSchema(): Promise<void> {
  await client.unsafe(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    DROP TABLE IF EXISTS revoked_tokens;
    DROP TABLE IF EXISTS otps;
    DROP TABLE IF EXISTS users;

    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      phone varchar(10) NOT NULL,
      city text NOT NULL,
      email varchar(255) NOT NULL,
      password_hash text NOT NULL,
      is_email_verified boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX users_email_uniq ON users(email);

    CREATE TABLE otps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email varchar(255) NOT NULL,
      code_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      verify_attempts integer NOT NULL DEFAULT 0,
      consumed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX otps_email_idx ON otps(email);
    CREATE INDEX otps_created_at_idx ON otps(created_at);

    CREATE TABLE revoked_tokens (
      jti varchar(64) PRIMARY KEY,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX revoked_tokens_expires_idx ON revoked_tokens(expires_at);
  `);
}

export async function truncateAll(): Promise<void> {
  await client.unsafe("TRUNCATE TABLE revoked_tokens, otps, users RESTART IDENTITY CASCADE;");
}

export async function closeTestDb(): Promise<void> {
  await client.end({ timeout: 5 });
}

export async function canReachDb(): Promise<boolean> {
  try {
    await client.unsafe("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
