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

interface Envelope {
  status: 1 | 0 | 2 | -1;
  message: string;
  data: Record<string, unknown>;
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return { res, body: (await res.json()) as Envelope };
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
  test.skipIf(!dbAvailable)("creates a user, sends OTP, returns envelope status=1", async () => {
    const { res, body } = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify(REGISTER_PAYLOAD),
    });
    expect(res.status).toBe(201);
    expect(body).toEqual({ status: 1, message: "OTP sent to email", data: {} });
    expect(captured).toHaveLength(1);
    expect(captured[0]?.to).toBe(REGISTER_PAYLOAD.email);
    expect(captured[0]?.code).toMatch(/^\d{6}$/);
  });

  test.skipIf(!dbAvailable)("rejects duplicate email — http 409, status=0", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    const { res, body } = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify(REGISTER_PAYLOAD),
    });
    expect(res.status).toBe(409);
    expect(body.status).toBe(0);
    expect(body.data.code).toBe("EMAIL_ALREADY_EXISTS");
    expect((body.data.fields as Record<string, string>).email).toBeDefined();
  });

  test.skipIf(!dbAvailable)(
    "rejects invalid input — http 422, status=0, field errors",
    async () => {
      const { res, body } = await api("/auth/register", {
        method: "POST",
        body: JSON.stringify({ ...REGISTER_PAYLOAD, phone: "123", email: "nope", password: "x" }),
      });
      expect(res.status).toBe(422);
      expect(body.status).toBe(0);
      expect(body.data.code).toBe("VALIDATION_FAILED");
      const fields = body.data.fields as Record<string, string>;
      expect(fields.phone).toBeDefined();
      expect(fields.email).toBeDefined();
      expect(fields.password).toBeDefined();
    },
  );
});

describe("POST /auth/verify-otp", () => {
  test.skipIf(!dbAvailable)("verifies correct OTP — status=1 with token+user in data", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    const otp = lastOtp();

    const { res, body } = await api("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email, otp }),
    });

    expect(res.status).toBe(200);
    expect(body.status).toBe(1);
    expect(body.message).toBe("Email verified");
    expect(typeof body.data.token).toBe("string");
    const user = body.data.user as Record<string, unknown>;
    expect(user.email).toBe(REGISTER_PAYLOAD.email);
    expect(user.isEmailVerified).toBe(true);
    expect(user.id).toBeDefined();
    expect(user.createdAt).toBeDefined();
  });

  test.skipIf(!dbAvailable)("wrong OTP — http 400, status=0", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    const { res, body } = await api("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email, otp: "000000" }),
    });
    expect(res.status).toBe(400);
    expect(body.status).toBe(0);
    expect(body.data.code).toBe("INVALID_OTP");
  });

  test.skipIf(!dbAvailable)("unregistered email — http 404, status=0", async () => {
    const { res, body } = await api("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: "ghost@example.com", otp: "123456" }),
    });
    expect(res.status).toBe(404);
    expect(body.status).toBe(0);
    expect(body.data.code).toBe("EMAIL_NOT_REGISTERED");
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
    expect(body).toEqual({ status: 1, message: "OTP resent", data: {} });
    expect(captured).toHaveLength(1);
  });

  test.skipIf(!dbAvailable)(
    "rate-limits after 3 resends in 10 min — http 429, status=0",
    async () => {
      await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
      for (let i = 0; i < 3; i++) {
        await api("/auth/resend-otp", {
          method: "POST",
          body: JSON.stringify({ email: REGISTER_PAYLOAD.email }),
        });
      }
      const { res, body } = await api("/auth/resend-otp", {
        method: "POST",
        body: JSON.stringify({ email: REGISTER_PAYLOAD.email }),
      });
      expect(res.status).toBe(429);
      expect(body.status).toBe(0);
      expect(body.data.code).toBe("OTP_RATE_LIMITED");
    },
  );

  test.skipIf(!dbAvailable)("unregistered email — http 404, status=0", async () => {
    const { res, body } = await api("/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ email: "ghost@example.com" }),
    });
    expect(res.status).toBe(404);
    expect(body.status).toBe(0);
    expect(body.data.code).toBe("EMAIL_NOT_REGISTERED");
  });
});

describe("POST /auth/login", () => {
  test.skipIf(!dbAvailable)("unverified email — http 403, status=2 (auth)", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    const { res, body } = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email, password: REGISTER_PAYLOAD.password }),
    });
    expect(res.status).toBe(403);
    expect(body.status).toBe(2);
    expect(body.data.code).toBe("EMAIL_NOT_VERIFIED");
  });

  test.skipIf(!dbAvailable)("happy path — status=1 with token+user", async () => {
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
    expect(body.status).toBe(1);
    expect(typeof body.data.token).toBe("string");
    expect((body.data.user as { email: string }).email).toBe(REGISTER_PAYLOAD.email);
  });

  test.skipIf(!dbAvailable)("wrong password — http 401, status=2 (auth)", async () => {
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
    expect(body.status).toBe(2);
    expect(body.data.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("POST /auth/logout", () => {
  test.skipIf(!dbAvailable)("revokes token; reuse → http 401, status=2", async () => {
    await api("/auth/register", { method: "POST", body: JSON.stringify(REGISTER_PAYLOAD) });
    const { body: vbody } = await api("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email: REGISTER_PAYLOAD.email, otp: lastOtp() }),
    });
    const token = vbody.data.token as string;

    const logout = await api("/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(logout.res.status).toBe(200);
    expect(logout.body.status).toBe(1);

    const second = await api("/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(second.res.status).toBe(401);
    expect(second.body.status).toBe(2);
    expect(second.body.data.code).toBe("TOKEN_REVOKED");
  });

  test.skipIf(!dbAvailable)("no auth header — http 401, status=2", async () => {
    const { res, body } = await api("/auth/logout", { method: "POST" });
    expect(res.status).toBe(401);
    expect(body.status).toBe(2);
    expect(body.data.code).toBe("UNAUTHORIZED");
  });
});

describe("misc", () => {
  test.skipIf(!dbAvailable)("GET /health → status=1", async () => {
    const { res, body } = await api("/health");
    expect(res.status).toBe(200);
    expect(body.status).toBe(1);
    expect(body.message).toBe("ok");
    expect(body.data.service).toBe("upsccompass-auth-api");
  });

  test.skipIf(!dbAvailable)("unknown route → http 404, status=0", async () => {
    const { res, body } = await api("/does-not-exist");
    expect(res.status).toBe(404);
    expect(body.status).toBe(0);
  });
});

void testDb;
