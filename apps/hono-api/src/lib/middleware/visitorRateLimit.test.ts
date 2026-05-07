import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  createVisitorRateLimitMiddleware,
  createVisitorWsRateLimiter,
} from "./visitorRateLimit.js";

function createTestApp(opts?: {
  perSecond?: number;
  perMinute?: number;
  perHour?: number;
}) {
  const limiter = createVisitorWsRateLimiter({
    perSecond: opts?.perSecond ?? 100,
    perMinute: opts?.perMinute ?? 100,
    perHour: opts?.perHour ?? 100,
  });
  const app = new Hono();
  app.use("*", createVisitorRateLimitMiddleware(limiter));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

function makeRequest(
  app: ReturnType<typeof createTestApp>,
  appId: string,
  visitorId: string,
) {
  return app.request("/test", {
    headers: {
      "X-App-Id": appId,
      "X-Visitor-Id": visitorId,
    },
  });
}

describe("createVisitorRateLimitMiddleware", () => {
  describe("passes through under limit", () => {
    it("allows a single request", async () => {
      const app = createTestApp();
      const res = await makeRequest(app, "app1", "visitor1");
      expect(res.status).toBe(200);
    });

    it("allows requests up to the per-second limit", async () => {
      const app = createTestApp({ perSecond: 3 });
      for (let i = 0; i < 3; i++) {
        const res = await makeRequest(app, "app1", "visitor1");
        expect(res.status).toBe(200);
      }
    });
  });

  describe("blocks when limit exceeded", () => {
    it("returns 429 after exceeding per-second limit", async () => {
      const app = createTestApp({ perSecond: 2 });
      await makeRequest(app, "app1", "visitor1");
      await makeRequest(app, "app1", "visitor1");
      const res = await makeRequest(app, "app1", "visitor1");
      expect(res.status).toBe(429);
    });

    it("includes Retry-After header", async () => {
      const app = createTestApp({ perSecond: 1 });
      await makeRequest(app, "app1", "visitor1");
      const res = await makeRequest(app, "app1", "visitor1");
      expect(res.headers.get("Retry-After")).toBeTruthy();
    });

    it("includes rate limit context headers on 429", async () => {
      const app = createTestApp({ perSecond: 2 });
      await makeRequest(app, "app1", "visitor1");
      await makeRequest(app, "app1", "visitor1");
      const res = await makeRequest(app, "app1", "visitor1");
      expect(res.status).toBe(429);
      expect(res.headers.get("X-RateLimit-Limit")).toBe("2");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
      const resetTs = Number(res.headers.get("X-RateLimit-Reset"));
      expect(resetTs).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it("distinguishes per-visitor cause in response body", async () => {
      const app = createTestApp({ perSecond: 1 });
      await makeRequest(app, "app1", "visitor1");
      const res = await makeRequest(app, "app1", "visitor1");
      const body = await res.json();
      expect(body.cause).toBe("per_visitor");
      expect(body.error).toBe("rate_limit_exceeded");
      expect(body.retryAfter).toBeTypeOf("number");
    });
  });

  describe("independent budgets per visitor", () => {
    it("two visitors under one app have independent limits", async () => {
      const app = createTestApp({ perSecond: 1 });

      const res1 = await makeRequest(app, "app1", "visitor1");
      expect(res1.status).toBe(200);

      const res2 = await makeRequest(app, "app1", "visitor2");
      expect(res2.status).toBe(200);

      const res3 = await makeRequest(app, "app1", "visitor1");
      expect(res3.status).toBe(429);

      const res4 = await makeRequest(app, "app1", "visitor2");
      expect(res4.status).toBe(429);
    });
  });

  describe("missing headers — IP fallback", () => {
    it("rate limits by IP when X-Visitor-Id is absent", async () => {
      const app = createTestApp({ perSecond: 1 });

      const res1 = await app.request("/test", {
        headers: { "X-App-Id": "app1", "X-Forwarded-For": "10.0.0.1" },
      });
      expect(res1.status).toBe(200);

      const res2 = await app.request("/test", {
        headers: { "X-App-Id": "app1", "X-Forwarded-For": "10.0.0.1" },
      });
      expect(res2.status).toBe(429);
    });

    it("rate limits by IP when X-App-Id is absent", async () => {
      const app = createTestApp({ perSecond: 1 });

      const res1 = await app.request("/test", {
        headers: { "X-Visitor-Id": "visitor1", "X-Forwarded-For": "10.0.0.2" },
      });
      expect(res1.status).toBe(200);

      const res2 = await app.request("/test", {
        headers: { "X-Visitor-Id": "visitor1", "X-Forwarded-For": "10.0.0.2" },
      });
      expect(res2.status).toBe(429);
    });

    it("rate limits by IP when both headers are absent", async () => {
      const app = createTestApp({ perSecond: 1 });

      const res1 = await app.request("/test", {
        headers: { "X-Forwarded-For": "10.0.0.3" },
      });
      expect(res1.status).toBe(200);

      const res2 = await app.request("/test", {
        headers: { "X-Forwarded-For": "10.0.0.3" },
      });
      expect(res2.status).toBe(429);
    });

    it("different IPs have independent budgets when headers are missing", async () => {
      const app = createTestApp({ perSecond: 1 });

      const res1 = await app.request("/test", {
        headers: { "X-Forwarded-For": "10.0.0.4" },
      });
      expect(res1.status).toBe(200);

      const res2 = await app.request("/test", {
        headers: { "X-Forwarded-For": "10.0.0.5" },
      });
      expect(res2.status).toBe(200);
    });
  });
});
