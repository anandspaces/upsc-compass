import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../utils/errors";
import { errorResponse } from "../utils/response";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, "INTERNAL_ERROR", `Route not found: ${req.method} ${req.path}`));
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) return errorResponse(res, err);

  if (err instanceof SyntaxError && "body" in (err as object)) {
    return errorResponse(
      res,
      new AppError(400, "VALIDATION_FAILED", "Request body is not valid JSON."),
    );
  }

  if (env.NODE_ENV !== "test") {
    console.error("[unhandled]", err);
  }
  return errorResponse(
    res,
    new AppError(
      500,
      "INTERNAL_ERROR",
      env.NODE_ENV === "production"
        ? "Something went wrong."
        : err instanceof Error
          ? err.message
          : String(err),
    ),
  );
}
