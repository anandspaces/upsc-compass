import "../helpers/test-env";

import { describe, expect, test } from "bun:test";
import jwt from "jsonwebtoken";
import { signAccessToken, verifyAccessToken } from "../../src/services/jwt.service";

describe("jwt.service", () => {
  test("signAccessToken returns a verifiable HS256 token with jti, sub, exp", () => {
    const { token, jti, expiresAt } = signAccessToken({
      userId: "11111111-1111-1111-1111-111111111111",
      email: "user@example.com",
    });
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe("11111111-1111-1111-1111-111111111111");
    expect(decoded.email).toBe("user@example.com");
    expect(decoded.jti).toBe(jti);
    expect(decoded.iss).toBe("upsccompass-test");
    expect(decoded.exp * 1000).toBe(expiresAt.getTime());
  });

  test("each signed token has a unique jti", () => {
    const a = signAccessToken({ userId: "u", email: "a@b.c" });
    const b = signAccessToken({ userId: "u", email: "a@b.c" });
    expect(a.jti).not.toBe(b.jti);
  });

  test("verifyAccessToken throws JsonWebTokenError on a tampered token", () => {
    const { token } = signAccessToken({ userId: "u", email: "a@b.c" });
    const tampered = `${token.slice(0, -2)}AA`;
    expect(() => verifyAccessToken(tampered)).toThrow(jwt.JsonWebTokenError);
  });

  test("verifyAccessToken throws when signed with a different secret", () => {
    const bad = jwt.sign({ email: "a@b.c" }, "different-secret", {
      algorithm: "HS256",
      subject: "u",
      issuer: "upsccompass-test",
      jwtid: "x",
      expiresIn: "1h",
    });
    expect(() => verifyAccessToken(bad)).toThrow(jwt.JsonWebTokenError);
  });
});
