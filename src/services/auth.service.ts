import { eq } from "drizzle-orm";
import { type DB, getDb } from "../db";
import { type User, revokedTokens, users } from "../db/schema";
import { Errors } from "../utils/errors";
import { sendOtpEmail } from "./email.service";
import { signAccessToken } from "./jwt.service";
import { issueOtp, verifyOtp } from "./otp.service";
import { hashPassword, verifyPassword } from "./password.service";

export interface PublicUser {
  id: string;
  name: string;
  phone: string;
  city: string;
  email: string;
  isEmailVerified: boolean;
  createdAt: string;
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    city: u.city,
    email: u.email,
    isEmailVerified: u.isEmailVerified,
    createdAt: u.createdAt.toISOString(),
  };
}

export interface RegisterInput {
  name: string;
  phone: string;
  city: string;
  email: string;
  password: string;
}

export async function register(input: RegisterInput, db: DB = getDb()): Promise<void> {
  const email = input.email.toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing.length > 0) throw Errors.emailAlreadyExists();

  const passwordHash = await hashPassword(input.password);
  await db.insert(users).values({
    name: input.name,
    phone: input.phone,
    city: input.city,
    email,
    passwordHash,
  });

  const { code } = await issueOtp(email, { db, enforceRateLimit: false });
  await sendOtpEmail(email, code);
}

export async function resendOtp(email: string, db: DB = getDb()): Promise<void> {
  const normalized = email.toLowerCase();
  const [user] = await db
    .select({ id: users.id, isEmailVerified: users.isEmailVerified })
    .from(users)
    .where(eq(users.email, normalized));
  if (!user) throw Errors.emailNotRegistered();

  const { code } = await issueOtp(normalized, { db, enforceRateLimit: true });
  await sendOtpEmail(normalized, code);
}

export interface AuthSuccess {
  token: string;
  user: PublicUser;
}

export async function verifyOtpAndIssueToken(
  email: string,
  otp: string,
  db: DB = getDb(),
): Promise<AuthSuccess> {
  const normalized = email.toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, normalized));
  if (!user) throw Errors.emailNotRegistered();

  await verifyOtp(normalized, otp, { db });

  if (!user.isEmailVerified) {
    await db.update(users).set({ isEmailVerified: true }).where(eq(users.id, user.id));
    user.isEmailVerified = true;
  }

  const { token } = signAccessToken({ userId: user.id, email: user.email });
  return { token, user: toPublicUser(user) };
}

export async function login(
  email: string,
  password: string,
  db: DB = getDb(),
): Promise<AuthSuccess> {
  const normalized = email.toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, normalized));
  if (!user) throw Errors.invalidCredentials();

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw Errors.invalidCredentials();

  if (!user.isEmailVerified) throw Errors.emailNotVerified();

  const { token } = signAccessToken({ userId: user.id, email: user.email });
  return { token, user: toPublicUser(user) };
}

export async function revokeToken(jti: string, expiresAt: Date, db: DB = getDb()): Promise<void> {
  await db
    .insert(revokedTokens)
    .values({ jti, expiresAt })
    .onConflictDoNothing({ target: revokedTokens.jti });
}

export async function isTokenRevoked(jti: string, db: DB = getDb()): Promise<boolean> {
  const rows = await db
    .select({ jti: revokedTokens.jti })
    .from(revokedTokens)
    .where(eq(revokedTokens.jti, jti));
  return rows.length > 0;
}
