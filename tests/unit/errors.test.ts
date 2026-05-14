import "../helpers/test-env";

import { describe, expect, test } from "bun:test";
import { AppError, Errors } from "../../src/utils/errors";

describe("AppError + Errors factory", () => {
  test("emailAlreadyExists is a 409 with the right code and field hint", () => {
    const err = Errors.emailAlreadyExists();
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("EMAIL_ALREADY_EXISTS");
    expect(err.fields).toEqual({ email: "Already registered" });
  });

  test("validation collects field-level errors", () => {
    const err = Errors.validation({ name: "Required", email: "Invalid email" });
    expect(err.status).toBe(422);
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.fields).toEqual({ name: "Required", email: "Invalid email" });
  });

  test("invalidCredentials is 401 and does not leak which field is wrong", () => {
    const err = Errors.invalidCredentials();
    expect(err.status).toBe(401);
    expect(err.fields).toBeUndefined();
  });

  test("emailNotVerified is 403", () => {
    expect(Errors.emailNotVerified().status).toBe(403);
  });

  test("otpRateLimited is 429 and mentions the retry window", () => {
    const err = Errors.otpRateLimited(120);
    expect(err.status).toBe(429);
    expect(err.message).toMatch(/minute/);
  });
});
