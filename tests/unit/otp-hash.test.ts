import "../helpers/test-env";

import { describe, expect, test } from "bun:test";
import { hashCode } from "../../src/services/otp.service";

describe("otp hashing", () => {
  test("is deterministic for the same email+code pair", () => {
    expect(hashCode("123456", "a@b.co")).toBe(hashCode("123456", "a@b.co"));
  });

  test("changes when the code differs", () => {
    expect(hashCode("123456", "a@b.co")).not.toBe(hashCode("123457", "a@b.co"));
  });

  test("changes when the email differs (email is salt)", () => {
    expect(hashCode("123456", "a@b.co")).not.toBe(hashCode("123456", "x@b.co"));
  });

  test("produces a 64-char hex string (sha256)", () => {
    const h = hashCode("123456", "a@b.co");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
