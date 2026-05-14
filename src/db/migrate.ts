import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { env } from "../config/env";

async function main() {
  const url = env.DATABASE_URL;
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  console.log("Running migrations against", url.replace(/:[^@/]+@/, ":****@"));
  await migrate(db, { migrationsFolder: "./drizzle" });
  await client.end();
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
