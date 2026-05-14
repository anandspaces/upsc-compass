import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { isTokenRevoked } from "../services/auth.service";
import { type AppJwtPayload, verifyAccessToken } from "../services/jwt.service";
import { Errors } from "../utils/errors";

export interface AuthenticatedRequest extends Request {
  auth: AppJwtPayload;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? req.header("Authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return next(Errors.unauthorized());
  }
  const token = header.slice(7).trim();
  if (!token) return next(Errors.unauthorized());

  try {
    const payload = verifyAccessToken(token);
    if (payload.jti && (await isTokenRevoked(payload.jti))) {
      return next(Errors.tokenRevoked());
    }
    (req as AuthenticatedRequest).auth = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return next(Errors.tokenExpired());
    if (err instanceof jwt.JsonWebTokenError) return next(Errors.unauthorized());
    next(err);
  }
}
