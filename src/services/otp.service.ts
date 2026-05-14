import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { env } from "../config/env";
import { type DB, getDb } from "../db";
import { otps } from "../db/schema";
import { Errors } from "../utils/errors";

function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

export function hashCode(code: string, email: string): string {
  return createHmac("sha256", env.OTP_SECRET).update(`${email}:${code}`).digest("hex");
}

function constantTimeEqualsHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export async function issueOtp(
  email: string,
  opts: { db?: DB; enforceRateLimit?: boolean } = {},
): Promise<{ code: string; expiresAt: Date }> {
  const db = opts.db ?? getDb();
  const enforceRateLimit = opts.enforceRateLimit ?? true;
  const normalizedEmail = email.toLowerCase();

  if (enforceRateLimit) {
    const windowStart = new Date(Date.now() - env.OTP_RESEND_WINDOW_MINUTES * 60_000);
    const recent = await db
      .select({ createdAt: otps.createdAt })
      .from(otps)
      .where(and(eq(otps.email, normalizedEmail), gte(otps.createdAt, windowStart)));
    if (recent.length >= env.OTP_RESEND_MAX_PER_WINDOW) {
      const first = recent[0];
      if (!first) throw new Error("unreachable");
      const oldest = recent.reduce(
        (min, r) => (r.createdAt < min ? r.createdAt : min),
        first.createdAt,
      );
      const retryAfterMs = oldest.getTime() + env.OTP_RESEND_WINDOW_MINUTES * 60_000 - Date.now();
      throw Errors.otpRateLimited(Math.max(1, Math.ceil(retryAfterMs / 1000)));
    }
  }

  const code = generateCode();
  const codeHash = hashCode(code, normalizedEmail);
  const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60_000);

  await db.insert(otps).values({ email: normalizedEmail, codeHash, expiresAt });
  return { code, expiresAt };
}

export async function verifyOtp(
  email: string,
  code: string,
  opts: { db?: DB } = {},
): Promise<void> {
  const db = opts.db ?? getDb();
  const normalizedEmail = email.toLowerCase();

  const [active] = await db
    .select()
    .from(otps)
    .where(and(eq(otps.email, normalizedEmail), eq(otps.consumed, false)))
    .orderBy(desc(otps.createdAt))
    .limit(1);

  if (!active) throw Errors.invalidOtp();
  if (active.expiresAt.getTime() < Date.now()) throw Errors.otpExpired();
  if (active.verifyAttempts >= env.OTP_MAX_VERIFY_ATTEMPTS) throw Errors.otpAttemptsExceeded();

  const candidate = hashCode(code, normalizedEmail);
  if (!constantTimeEqualsHex(candidate, active.codeHash)) {
    await db
      .update(otps)
      .set({ verifyAttempts: active.verifyAttempts + 1 })
      .where(eq(otps.id, active.id));
    if (active.verifyAttempts + 1 >= env.OTP_MAX_VERIFY_ATTEMPTS) {
      throw Errors.otpAttemptsExceeded();
    }
    throw Errors.invalidOtp();
  }

  await db.update(otps).set({ consumed: true }).where(eq(otps.id, active.id));
}
