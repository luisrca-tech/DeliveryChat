import { describe, it, expect } from "vitest";
import { signWsToken, verifyWsToken } from "./wsToken.js";

const SECRET = "test-secret-that-is-long-enough-for-hmac-signing";

const validPayload = {
  appId: "550e8400-e29b-41d4-a716-446655440000",
  origin: "https://example.com",
  visitorId: "660e8400-e29b-41d4-a716-446655440001",
};

describe("signWsToken", () => {
  it("returns a non-empty string token", () => {
    const token = signWsToken(validPayload, SECRET);
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
  });

  it("produces different tokens for different payloads", () => {
    const t1 = signWsToken(validPayload, SECRET);
    const t2 = signWsToken({ ...validPayload, visitorId: "other-id" }, SECRET);
    expect(t1).not.toBe(t2);
  });

  it("produces different tokens for different secrets", () => {
    const t1 = signWsToken(validPayload, SECRET);
    const t2 = signWsToken(validPayload, "different-secret-key-for-testing");
    expect(t1).not.toBe(t2);
  });
});

describe("verifyWsToken", () => {
  it("verifies a valid token and returns the payload", () => {
    const token = signWsToken(validPayload, SECRET);
    const result = verifyWsToken(token, SECRET);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.payload.appId).toBe(validPayload.appId);
    expect(result.payload.origin).toBe(validPayload.origin);
    expect(result.payload.visitorId).toBe(validPayload.visitorId);
    expect(result.payload.iat).toBeTypeOf("number");
    expect(result.payload.exp).toBeTypeOf("number");
  });

  it("rejects a tampered signature", () => {
    const token = signWsToken(validPayload, SECRET);
    const parts = token.split(".");
    parts[1] = parts[1]!.slice(0, -2) + "XX";
    const tampered = parts.join(".");

    const result = verifyWsToken(tampered, SECRET);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.error).toBe("invalid_signature");
  });

  it("rejects a token signed with a different secret", () => {
    const token = signWsToken(validPayload, "wrong-secret-key-that-is-long");
    const result = verifyWsToken(token, SECRET);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.error).toBe("invalid_signature");
  });

  it("rejects an expired token", () => {
    const token = signWsToken(validPayload, SECRET, { ttlSeconds: -1 });
    const result = verifyWsToken(token, SECRET);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.error).toBe("token_expired");
  });

  it("rejects a malformed token (missing parts)", () => {
    const result = verifyWsToken("not-a-valid-token", SECRET);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.error).toBe("malformed_token");
  });

  it("rejects an empty string", () => {
    const result = verifyWsToken("", SECRET);
    expect(result.valid).toBe(false);
  });

  it("validates origin binding — mismatch rejects", () => {
    const token = signWsToken(validPayload, SECRET);
    const result = verifyWsToken(token, SECRET, {
      expectedOrigin: "https://evil.com",
    });
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.error).toBe("origin_mismatch");
  });

  it("validates origin binding — match passes", () => {
    const token = signWsToken(validPayload, SECRET);
    const result = verifyWsToken(token, SECRET, {
      expectedOrigin: "https://example.com",
    });
    expect(result.valid).toBe(true);
  });

  it("respects custom TTL", () => {
    const token = signWsToken(validPayload, SECRET, { ttlSeconds: 3600 });
    const result = verifyWsToken(token, SECRET);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.payload.exp - result.payload.iat).toBe(3600);
  });

  it("rejects a token with tampered payload", () => {
    const token = signWsToken(validPayload, SECRET);
    const parts = token.split(".");
    const decoded = JSON.parse(
      Buffer.from(parts[0]!, "base64url").toString(),
    );
    decoded.visitorId = "attacker-id";
    parts[0] = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    const tampered = parts.join(".");

    const result = verifyWsToken(tampered, SECRET);
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.error).toBe("invalid_signature");
  });
});
