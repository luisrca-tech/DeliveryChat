import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("resendOtpRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function loadModule() {
    const mod = await import("./resendOtpRateLimit.js");
    return mod;
  }

  it("allows first request", async () => {
    const { checkResendOtpRateLimit } = await loadModule();
    const result = checkResendOtpRateLimit("test@example.com");
    expect(result.allowed).toBe(true);
  });

  it("blocks within cooldown period", async () => {
    const { checkResendOtpRateLimit } = await loadModule();
    checkResendOtpRateLimit("test@example.com");
    const result = checkResendOtpRateLimit("test@example.com");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("cleans up expired entries via periodic cleanup", async () => {
    const { checkResendOtpRateLimit, getStoreSize } = await loadModule();

    checkResendOtpRateLimit("user1@example.com");
    checkResendOtpRateLimit("user2@example.com");
    expect(getStoreSize()).toBe(2);

    vi.advanceTimersByTime(25 * 60 * 60 * 1000);

    expect(getStoreSize()).toBe(0);
  });

  it("does not clean up entries within the 24h window", async () => {
    const { checkResendOtpRateLimit, getStoreSize } = await loadModule();

    checkResendOtpRateLimit("user1@example.com");
    expect(getStoreSize()).toBe(1);

    vi.advanceTimersByTime(30 * 60 * 1000);

    expect(getStoreSize()).toBe(1);
  });
});
