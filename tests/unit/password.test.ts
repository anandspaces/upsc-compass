import "../helpers/test-env";

import { describe, expect, test } from "bun:test";
import { hashPassword, verifyPassword } from "../../src/services/password.service";

describe("password.service", () => {
  test("hashPassword produces a bcrypt-format hash", async () => {
    const hash = await hashPassword("supersecret");
    expect(hash.startsWith("$2")).toBe(true);
    expect(hash.length).toBeGreaterThan(40);
  });

  test("verifyPassword returns true for the correct password", async () => {
    const hash = await hashPassword("supersecret");
    expect(await verifyPassword("supersecret", hash)).toBe(true);
  });

  test("verifyPassword returns false for the wrong password", async () => {
    const hash = await hashPassword("supersecret");
    expect(await verifyPassword("nope", hash)).toBe(false);
  });

  test("verifyPassword returns false for a malformed hash without throwing", async () => {
    expect(await verifyPassword("anything", "not-a-real-hash")).toBe(false);
  });

  test("hashing the same password twice yields different hashes (salt)", async () => {
    const a = await hashPassword("supersecret");
    const b = await hashPassword("supersecret");
    expect(a).not.toBe(b);
  });
});
