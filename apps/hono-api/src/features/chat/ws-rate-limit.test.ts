import { describe, it, expect } from "vitest";
import { createVisitorWsRateLimiter } from "../../lib/middleware/visitorRateLimit.js";
import type { RateLimitConfig } from "../rate-limiting/types.js";

function createLimiter(overrides?: Partial<RateLimitConfig>) {
  return createVisitorWsRateLimiter({
    perSecond: overrides?.perSecond ?? 100,
    perMinute: overrides?.perMinute ?? 100,
    perHour: overrides?.perHour ?? 100,
  });
}

async function exhaust(
  limiter: ReturnType<typeof createLimiter>,
  key: string,
  count: number,
) {
  for (let i = 0; i < count; i++) {
    limiter.check(key);
  }
}

describe("createVisitorWsRateLimiter", () => {
  describe("blocks when limit exceeded", () => {
    it("rejects after exceeding per-second limit", () => {
      const limiter = createLimiter({ perSecond: 2 });
      const key = "visitor:app1:visitor1";

      expect(limiter.check(key).allowed).toBe(true);
      expect(limiter.check(key).allowed).toBe(true);

      const result = limiter.check(key);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.window).toBe("second");
        expect(result.retryAfter).toBeGreaterThan(0);
      }
    });

    it("rejects after exceeding per-minute limit", () => {
      const limiter = createLimiter({ perMinute: 3 });
      const key = "visitor:app1:visitor1";

      exhaust(limiter, key, 3);
      const result = limiter.check(key);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.window).toBe("minute");
      }
    });

    it("rejects after exceeding per-hour limit", () => {
      const limiter = createLimiter({ perHour: 3 });
      const key = "visitor:app1:visitor1";

      exhaust(limiter, key, 3);
      const result = limiter.check(key);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.window).toBe("hour");
      }
    });

    it("returns retryAfter as a positive number", () => {
      const limiter = createLimiter({ perSecond: 1 });
      const key = "visitor:app1:visitor1";

      limiter.check(key);
      const result = limiter.check(key);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.retryAfter).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(result.retryAfter)).toBe(true);
      }
    });
  });

  describe("allows under limit", () => {
    it("allows requests within per-second limit", () => {
      const limiter = createLimiter({ perSecond: 3 });
      const key = "visitor:app1:visitor1";

      for (let i = 0; i < 3; i++) {
        expect(limiter.check(key).allowed).toBe(true);
      }
    });
  });

  describe("independent budgets per visitor", () => {
    it("two visitors have independent limits", () => {
      const limiter = createLimiter({ perSecond: 1 });

      expect(limiter.check("visitor:app1:v1").allowed).toBe(true);
      expect(limiter.check("visitor:app1:v2").allowed).toBe(true);

      expect(limiter.check("visitor:app1:v1").allowed).toBe(false);
      expect(limiter.check("visitor:app1:v2").allowed).toBe(false);
    });
  });

  describe("per-second fires before per-minute", () => {
    it("reports the tightest violated window", () => {
      const limiter = createLimiter({ perSecond: 2, perMinute: 5 });
      const key = "visitor:app1:visitor1";

      exhaust(limiter, key, 2);
      const result = limiter.check(key);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.window).toBe("second");
      }
    });
  });
});
