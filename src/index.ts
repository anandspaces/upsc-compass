import { buildApp } from "./app";
import { env, loadEnv } from "./config/env";
import { closeDb, getDb } from "./db";

async function main() {
  loadEnv();
  getDb();

  const app = buildApp();
  const server = app.listen(env.PORT, () => {
    console.log(`upsccompass-api listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[${signal}] shutting down...`);
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
