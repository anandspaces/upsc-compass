import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: z.string().default("*"),

  DATABASE_URL: z.string().url(),
  TEST_DATABASE_URL: z.string().url().optional(),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  JWT_ISSUER: z.string().default("upsccompass"),

  OTP_SECRET: z.string().min(16, "OTP_SECRET must be at least 16 characters"),
  OTP_EXPIRY_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_VERIFY_ATTEMPTS: z.coerce.number().int().positive().default(3),
  OTP_RESEND_WINDOW_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_RESEND_MAX_PER_WINDOW: z.coerce.number().int().positive().default(3),

  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),

  EMAIL_FROM: z.string().email().default("no-reply@dextora.app"),
  EMAIL_FROM_NAME: z.string().default("Dextora UPSC Compass"),

  // For Gmail: smtp.gmail.com / 587 / secure=false (STARTTLS).
  // SMTP_USER = your Gmail address, SMTP_PASSWORD = 16-char app password.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")])
    .optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}

export const env = new Proxy({} as Env, {
  get(_t, key: string) {
    return loadEnv()[key as keyof Env];
  },
});
