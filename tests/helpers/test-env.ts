// Set fixed test env BEFORE any module reads it.
// Test-critical values use `=` (force override) so they're stable regardless of the
// developer's local .env. Connection strings use `??=` so they can be redirected via
// the shell to point at a real test database.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-must-be-at-least-32-characters-long-xxx";
process.env.JWT_EXPIRES_IN = "1h";
process.env.JWT_ISSUER = "upsccompass-test";
process.env.OTP_SECRET = "test-otp-secret-also-long-enough";
process.env.OTP_EXPIRY_MINUTES = "10";
process.env.OTP_MAX_VERIFY_ATTEMPTS = "3";
process.env.OTP_RESEND_WINDOW_MINUTES = "10";
process.env.OTP_RESEND_MAX_PER_WINDOW = "3";
process.env.BCRYPT_COST = "4";
process.env.EMAIL_PROVIDER = "console";
process.env.EMAIL_FROM = "test@dextora.app";
process.env.CORS_ORIGINS = "*";

process.env.DATABASE_URL ??=
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/upsccompass_test_db";

export const isDbAvailable = !!(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
