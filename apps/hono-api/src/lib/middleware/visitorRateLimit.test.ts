import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { createVisitorRateLimitMiddleware } from "./visitorRateLimit.js";

function createTestApp(opts?: {
  perSecond?: number;
  perMinute?: number;
  perHour?: number;
}) {
  const app = new Hono();
  app.use(
    "*",
    createVisitorRateLimitMiddleware({
      perSecond: opts?.perSecond ?? 100,
      perMinute: opts?.perMinute ?? 100,
      perHour: opts?.perHour ?? 100,
    }),
  );
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

    it("distinguishes per-visitor cause in response body", async () => {
      const app = createTestApp({ perSecond: 1 });
      await makeRequest(app, "app1", "visitor1");
      const res = await makeRequest(app, "app1", "visitor1");
      const body = await res.json();
      expect(body.cause).toBe("per_visitor");
      expect(body.error).toBe("Rate limit exceeded");
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

  describe("missing headers", () => {
    it("passes through when X-Visitor-Id is absent", async () => {
      const app = createTestApp({ perSecond: 1 });
      const res = await app.request("/test", {
        headers: { "X-App-Id": "app1" },
      });
      expect(res.status).toBe(200);
    });

    it("passes through when X-App-Id is absent", async () => {
      const app = createTestApp({ perSecond: 1 });
      const res = await app.request("/test", {
        headers: { "X-Visitor-Id": "visitor1" },
      });
      expect(res.status).toBe(200);
    });
  });
});
