import { randomBytes } from "node:crypto";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface AppJwtPayload extends JwtPayload {
  sub: string;
  email: string;
  jti: string;
  iat: number;
  exp: number;
}

export function signAccessToken(params: { userId: string; email: string }): {
  token: string;
  jti: string;
  expiresAt: Date;
} {
  const jti = randomBytes(16).toString("hex");
  const options: SignOptions = {
    algorithm: "HS256",
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    issuer: env.JWT_ISSUER,
    subject: params.userId,
    jwtid: jti,
  };
  const token = jwt.sign({ email: params.email }, env.JWT_SECRET, options);
  const decoded = jwt.decode(token) as AppJwtPayload;
  return { token, jti, expiresAt: new Date(decoded.exp * 1000) };
}

export function verifyAccessToken(token: string): AppJwtPayload {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: env.JWT_ISSUER,
  }) as AppJwtPayload;
}
