import "../helpers/test-env";

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { buildApp } from "../../src/app";
import { setEmailProvider } from "../../src/services/email.service";
import { canReachDb, closeTestDb, setupSchema, testDb, truncateAll } from "../helpers/db";

interface CapturedEmail {
  to: string;
  code: string;
}

const captured: CapturedEmail[] = [];

setEmailProvider({
  async send(msg) {
    const m = msg.text.match(/(\d{6})/);
    if (m?.[1]) captured.push({ to: msg.to, code: m[1] });
  },
});

function lastOtp(): string {
  const e = captured[captured.length - 1];
  if (!e) throw new Error("no captured OTP");
  return e.code;
}

let server: Server;
let baseUrl: string;
let dbAvailable = false;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  dbAvailable = await canReachDb();
  if (!dbAvailable) {
    console.warn(
      "\n[e2e] Skipping: cannot reach TEST_DATABASE_URL. " +
        "Set TEST_DATABASE_URL (or DATABASE_URL) to a running Postgres to run these tests.\n",
    );
    return;
  }
  await setupSchema();

  // Inject the test db into the app's auth service by replacing getDb with our connection.
  // We do this by mocking the module-level db: simpler approach is to ensure DATABASE_URL
  // points at the same TEST_DATABASE_URL. test-env.ts already aliases them.
  const app = buildApp();
  server = app.listen(0);
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
});

afterEach(async () => {
  if (dbAvailable) {
    await truncateAll();
    captured.length = 0;
  }
});

afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (dbAvailable) await closeTestDb();
});

const REGISTER_PAYLOAD = {
  name: "Rajat Tyagi",
  phone: "9876543210",
  city: "Delhi",
  email: "rajat@example.com",
  password: "secret1",
};

describe("POST /auth/register", () => {
  test.skipIf(!dbAvailable)("creates a user and sends OTP", async () => {
    const { res, body } = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify(REGISTER_PAYLOAD),
    });
    expect(res.status).toBe(201);
    expect(body).toEqual({ status: 1, message: "OTP sent to email" });
    expect(captured).toHaveLength(1);
    expect(captured[0]?.to).toBe(REGISTER_PAYLOAD.email);
    expect(captured[0]?.code).toMatch(/^\d{6}$/);
  });

  test.skipIf(!dbAvailable)("rejects a duplicate email with 409", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    const { res, body } = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify(REGISTER_PAYLOAD),
    });
    expect(res.status).toBe(409);
    expect(body.status).toBe(0);
    expect((body.error as { code: string }).code).toBe("EMAIL_ALREADY_EXISTS");
  });

  test.skipIf(!dbAvailable)("rejects invalid input with 422 and field errors", async () => {
    const { res, body } = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ ...REGISTER_PAYLOAD, phone: "123", email: "nope", password: "x" }),
    });
    expect(res.status).toBe(422);
    const err = body.error as { code: string; fields: Record<string, string> };
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.fields.phone).toBeDefined();
    expect(err.fields.email).toBeDefined();
    expect(err.fields.password).toBeDefined();
  });
});

describe("POST /auth/verify-otp", () => {
  test.skipIf(!dbAvailable)("verifies a correct OTP and returns a JWT + user", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    const otp = lastOtp();

    const { res, body } = await api("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email, otp }),
    });

    expect(res.status).toBe(200);
    expect(body.status).toBe(1);
    expect(typeof body.token).toBe("string");
    const user = body.user as Record<string, unknown>;
    expect(user.email).toBe(REGISTER_PAYLOAD.email);
    expect(user.isEmailVerified).toBe(true);
    expect(user.id).toBeDefined();
    expect(user.createdAt).toBeDefined();
  });

  test.skipIf(!dbAvailable)("returns 400 for a wrong OTP", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    const { res, body } = await api("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email, otp: "000000" }),
    });
    expect(res.status).toBe(400);
    expect((body.error as { code: string }).code).toBe("INVALID_OTP");
  });

  test.skipIf(!dbAvailable)("returns 404 if the email is not registered", async () => {
    const { res, body } = await api("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: "ghost@example.com", otp: "123456" }),
    });
    expect(res.status).toBe(404);
    expect((body.error as { code: string }).code).toBe("EMAIL_NOT_REGISTERED");
  });
});

describe("POST /auth/resend-otp", () => {
  test.skipIf(!dbAvailable)("resends OTP for a registered email", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    captured.length = 0;
    const { res, body } = await api("/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email }),
    });
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 1, message: "OTP resent" });
    expect(captured).toHaveLength(1);
  });

  test.skipIf(!dbAvailable)("rate-limits after 3 resends in 10 minutes (429)", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    // Register issues 1 OTP (rate-limit-exempt). 3 explicit resends should land at the limit.
    await api("/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email }),
    });
    await api("/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email }),
    });
    await api("/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email }),
    });
    const { res, body } = await api("/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email }),
    });
    expect(res.status).toBe(429);
    expect((body.error as { code: string }).code).toBe("OTP_RATE_LIMITED");
  });

  test.skipIf(!dbAvailable)("404 when email isn't registered", async () => {
    const { res } = await api("/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email: "ghost@example.com" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /auth/login", () => {
  test.skipIf(!dbAvailable)("returns 403 when email is not yet verified", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    const { res, body } = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email, password: REGISTER_PAYLOAD.password }),
    });
    expect(res.status).toBe(403);
    expect((body.error as { code: string }).code).toBe("EMAIL_NOT_VERIFIED");
  });

  test.skipIf(!dbAvailable)("logs in and returns a token once email is verified", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    await api("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email, otp: lastOtp() }),
    });

    const { res, body } = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email, password: REGISTER_PAYLOAD.password }),
    });
    expect(res.status).toBe(200);
    expect(typeof body.token).toBe("string");
    expect((body.user as { email: string }).email).toBe(REGISTER_PAYLOAD.email);
  });

  test.skipIf(!dbAvailable)("returns 401 for wrong password", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    await api("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email, otp: lastOtp() }),
    });
    const { res, body } = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email, password: "wrongpass" }),
    });
    expect(res.status).toBe(401);
    expect((body.error as { code: string }).code).toBe("INVALID_CREDENTIALS");
  });
});

describe("POST /auth/logout", () => {
  test.skipIf(!dbAvailable)("revokes the token so the same jti can't be reused", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    const { body: vbody } = await api("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email, otp: lastOtp() }),
    });
    const token = vbody.token as string;

    const logout = await api("/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.res.status).toBe(200);

    const second = await api("/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(second.res.status).toBe(401);
    expect((second.body.error as { code: string }).code).toBe("TOKEN_REVOKED");
  });

  test.skipIf(!dbAvailable)("rejects requests without an Authorization header (401)", async () => {
    const { res, body } = await api("/auth/logout", { method: "POST" });
    expect(res.status).toBe(401);
    expect((body.error as { code: string }).code).toBe("UNAUTHORIZED");
  });
});

describe("misc", () => {
  test.skipIf(!dbAvailable)("GET /health returns ok", async () => {
    const { res, body } = await api("/health");
    expect(res.status).toBe(200);
    expect(body.status).toBe(1);
  });

  test.skipIf(!dbAvailable)("unknown route returns 404", async () => {
    const { res } = await api("/does-not-exist");
    expect(res.status).toBe(404);
  });
});

// Touch testDb to avoid unused-import warnings; helpers live there.
void testDb;
