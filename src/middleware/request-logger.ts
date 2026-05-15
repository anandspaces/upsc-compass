import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { formatForLog, humanTimestamp, newRequestId } from "../utils/logger";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

function describeRequestBody(req: Request): string {
  const contentType = (req.headers["content-type"] ?? "").toLowerCase();
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return "(no body)";
  }
  if (contentType.includes("multipart/form-data")) {
    const len = req.headers["content-length"];
    return `[multipart/form-data${len ? `, ${len} bytes` : ""}]`;
  }
  if (req.body === undefined || req.body === null) return "(empty)";
  if (typeof req.body === "object" && Object.keys(req.body).length === 0) {
    return "(empty)";
  }
  return formatForLog(req.body);
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (env.NODE_ENV === "test") return next();

  const requestId = newRequestId();
  req.requestId = requestId;
  const startedAt = Date.now();
  const startTs = humanTimestamp(new Date(startedAt));

  const ip = req.ip ?? req.socket.remoteAddress ?? "-";
  const query =
    req.query && Object.keys(req.query).length > 0 ? ` query=${formatForLog(req.query)}` : "";

  console.log(
    `[${startTs}] [${requestId}] --> ${req.method} ${req.originalUrl} ip=${ip}${query} body=${describeRequestBody(req)}`,
  );

  let responseBody: unknown;
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    responseBody = body;
    return originalJson(body);
  };
  const originalSend = res.send.bind(res);
  res.send = (body: unknown) => {
    if (responseBody === undefined) responseBody = body;
    return originalSend(body);
  };

  res.on("finish", () => {
    const endedAt = Date.now();
    const endTs = humanTimestamp(new Date(endedAt));
    const durationMs = endedAt - startedAt;
    const bodyStr = responseBody === undefined ? "(no body)" : formatForLog(responseBody);
    console.log(
      `[${endTs}] [${requestId}] <-- ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms body=${bodyStr}`,
    );
  });

  res.on("close", () => {
    if (res.writableEnded) return;
    const endTs = humanTimestamp();
    const durationMs = Date.now() - startedAt;
    console.log(
      `[${endTs}] [${requestId}] <-x ${req.method} ${req.originalUrl} client_disconnected ${durationMs}ms`,
    );
  });

  next();
}
