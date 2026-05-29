import { describe, it, expect, vi, beforeEach } from "vitest";
import { InMemoryRateLimitStore } from "../ai.rateLimit.js";

const WINDOWS = [
  { windowMs: 60_000, maxRequests: 10 },
  { windowMs: 86_400_000, maxRequests: 250 },
];

describe("InMemoryRateLimitStore", () => {
  let store: InMemoryRateLimitStore;

  beforeEach(() => {
    store = new InMemoryRateLimitStore(WINDOWS);
  });

  it("allows requests under the limit", () => {
    const result = store.check("tenant-1");
    expect(result.allowed).toBe(true);
  });

  it("increments count on each call to increment", () => {
    for (let i = 0; i < 10; i++) {
      store.increment("tenant-1");
    }
    const result = store.check("tenant-1");
    expect(result.allowed).toBe(false);
  });

  it("returns retryAfterSeconds when rate limited", () => {
    for (let i = 0; i < 10; i++) {
      store.increment("tenant-1");
    }
    const result = store.check("tenant-1");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it("isolates tenants from each other", () => {
    for (let i = 0; i < 10; i++) {
      store.increment("tenant-A");
    }

    const resultA = store.check("tenant-A");
    const resultB = store.check("tenant-B");

    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);
  });

  it("resets windows after expiration", () => {
    vi.useFakeTimers();
    const now = Date.now();

    for (let i = 0; i < 10; i++) {
      store.increment("tenant-1");
    }
    expect(store.check("tenant-1").allowed).toBe(false);

    vi.setSystemTime(now + 61_000);
    expect(store.check("tenant-1").allowed).toBe(true);

    vi.useRealTimers();
  });

  it("initializes windows lazily on first check", () => {
    const result = store.check("new-tenant");
    expect(result.allowed).toBe(true);
  });

  it("cleans up fully expired window entries", () => {
    vi.useFakeTimers();
    const now = Date.now();

    store.increment("tenant-1");
    vi.setSystemTime(now + 86_400_001);

    store.check("tenant-1");
    store.increment("tenant-1");

    const result = store.check("tenant-1");
    expect(result.allowed).toBe(true);

    vi.useRealTimers();
  });
});
