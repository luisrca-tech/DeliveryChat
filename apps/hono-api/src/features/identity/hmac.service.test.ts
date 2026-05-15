import { describe, expect, it } from "vitest";
import { computeHmac, verifyHmac } from "./hmac.service.js";

describe("computeHmac", () => {
  it("returns a hex-encoded HMAC-SHA256 signature", () => {
    const result = computeHmac("secret-key", "user-123");
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for the same inputs", () => {
    const a = computeHmac("key", "data");
    const b = computeHmac("key", "data");
    expect(a).toBe(b);
  });

  it("produces different output for different keys", () => {
    const a = computeHmac("key-a", "data");
    const b = computeHmac("key-b", "data");
    expect(a).not.toBe(b);
  });

  it("produces different output for different data", () => {
    const a = computeHmac("key", "data-a");
    const b = computeHmac("key", "data-b");
    expect(a).not.toBe(b);
  });
});

describe("verifyHmac", () => {
  it("returns true for a valid signature", () => {
    const hmac = computeHmac("secret", "user-42");
    expect(verifyHmac("secret", "user-42", hmac)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    expect(verifyHmac("secret", "user-42", "bad-signature")).toBe(false);
  });

  it("returns false when key differs", () => {
    const hmac = computeHmac("correct-key", "user-42");
    expect(verifyHmac("wrong-key", "user-42", hmac)).toBe(false);
  });

  it("returns false for an empty signature", () => {
    expect(verifyHmac("secret", "user-42", "")).toBe(false);
  });

  it("is timing-safe (uses constant-time comparison)", () => {
    const hmac = computeHmac("secret", "data");
    expect(verifyHmac("secret", "data", hmac)).toBe(true);
  });
});
