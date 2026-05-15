import path from "node:path";
import express, { type Express } from "express";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";
import apiRoutes from "./routes";

export function buildApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(express.json({ limit: "100kb" }));

  app.use((req, res, next) => {
    const origins = env.CORS_ORIGINS.split(",").map((s) => s.trim());
    const origin = req.header("origin");
    if (origins.includes("*")) {
      res.header("Access-Control-Allow-Origin", "*");
    } else if (origin && origins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Authorization,Content-Type");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Serve uploaded files (e.g. report PDFs) as static assets.
  const uploadDir = path.isAbsolute(env.UPLOAD_DIR)
    ? env.UPLOAD_DIR
    : path.resolve(process.cwd(), env.UPLOAD_DIR);
  app.use(
    "/api/v1/files",
    express.static(uploadDir, {
      index: false,
      maxAge: "1h",
    }),
  );

  app.use("/api/v1", requestLogger, apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
