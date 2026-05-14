import "../helpers/test-env";

import { describe, expect, test } from "bun:test";
import {
  loginSchema,
  registerSchema,
  resendOtpSchema,
  verifyOtpSchema,
} from "../../src/validators/auth.validator";

describe("registerSchema", () => {
  const valid = {
    name: "Rajat",
    phone: "9876543210",
    city: "Delhi",
    email: "Rajat@Example.com",
    password: "secret1",
  };

  test("accepts valid input and lowercases email", () => {
    const parsed = registerSchema.parse(valid);
    expect(parsed.email).toBe("rajat@example.com");
  });

  test("rejects an empty name", () => {
    expect(registerSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
  });

  test("rejects a phone that is not exactly 10 digits", () => {
    for (const phone of ["123", "12345678901", "abcdefghij", ""]) {
      expect(registerSchema.safeParse({ ...valid, phone }).success).toBe(false);
    }
  });

  test("rejects malformed emails", () => {
    for (const email of ["nope", "x@y", "x@y.", "x.com", ""]) {
      expect(registerSchema.safeParse({ ...valid, email }).success).toBe(false);
    }
  });

  test("rejects passwords shorter than 6 chars", () => {
    expect(registerSchema.safeParse({ ...valid, password: "12345" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: "123456" }).success).toBe(true);
  });
});

describe("verifyOtpSchema", () => {
  test("requires a 6-digit numeric otp", () => {
    expect(verifyOtpSchema.safeParse({ email: "a@b.co", otp: "123456" }).success).toBe(true);
    expect(verifyOtpSchema.safeParse({ email: "a@b.co", otp: "12345" }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ email: "a@b.co", otp: "1234567" }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ email: "a@b.co", otp: "abcdef" }).success).toBe(false);
  });
});

describe("resendOtpSchema", () => {
  test("accepts a valid email and rejects an invalid one", () => {
    expect(resendOtpSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
    expect(resendOtpSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  test("requires email and password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "secret1" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "12" }).success).toBe(false);
  });
});
