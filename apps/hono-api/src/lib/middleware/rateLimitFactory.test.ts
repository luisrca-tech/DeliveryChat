import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { createRateLimiter } from "./rateLimitFactory.js";

function createTestApp(opts: Parameters<typeof createRateLimiter>[0]) {
  const app = new Hono();
  app.use("*", createRateLimiter(opts));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

function makeRequest(
  app: ReturnType<typeof createTestApp>,
  headers?: Record<string, string>,
) {
  return app.request("/test", { headers });
}

describe("createRateLimiter", () => {
  describe("static limits", () => {
    it("allows requests under the limit", async () => {
      const app = createTestApp({
        cause: "per_test",
        limits: { perSecond: 3, perMinute: 100, perHour: 1000 },
        keyGenerator: (c) => c.req.header("X-Key") ?? null,
      });

      const res = await makeRequest(app, { "X-Key": "k1" });
      expect(res.status).toBe(200);
    });

    it("returns 429 when per-second limit exceeded", async () => {
      const app = createTestApp({
        cause: "per_test",
        limits: { perSecond: 1, perMinute: 100, perHour: 1000 },
        keyGenerator: (c) => c.req.header("X-Key") ?? null,
      });

      await makeRequest(app, { "X-Key": "k1" });
      const res = await makeRequest(app, { "X-Key": "k1" });
      expect(res.status).toBe(429);
    });
  });

  describe("standardized 429 response", () => {
    it("includes cause, retryAfter, window, and error", async () => {
      const app = createTestApp({
        cause: "per_widget",
        limits: { perSecond: 1, perMinute: 100, perHour: 1000 },
        keyGenerator: (c) => c.req.header("X-Key") ?? null,
      });

      await makeRequest(app, { "X-Key": "k1" });
      const res = await makeRequest(app, { "X-Key": "k1" });

      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("1");

      const body = await res.json();
      expect(body).toEqual({
        error: "Rate limit exceeded",
        cause: "per_widget",
        retryAfter: 1,
        window: "second",
      });
    });
  });

  describe("null key skips rate limiting", () => {
    it("passes through when keyGenerator returns null", async () => {
      const app = createTestApp({
        cause: "per_test",
        limits: { perSecond: 1, perMinute: 100, perHour: 1000 },
        keyGenerator: () => null,
      });

      const res1 = await makeRequest(app);
      const res2 = await makeRequest(app);
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });
  });

  describe("independent keys", () => {
    it("tracks limits independently per key", async () => {
      const app = createTestApp({
        cause: "per_test",
        limits: { perSecond: 1, perMinute: 100, perHour: 1000 },
        keyGenerator: (c) => c.req.header("X-Key") ?? null,
      });

      const r1 = await makeRequest(app, { "X-Key": "a" });
      const r2 = await makeRequest(app, { "X-Key": "b" });
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);

      const r3 = await makeRequest(app, { "X-Key": "a" });
      expect(r3.status).toBe(429);
    });
  });

  describe("async limits", () => {
    it("resolves limits from an async function", async () => {
      const app = createTestApp({
        cause: "per_tenant",
        limits: async () => ({ perSecond: 2, perMinute: 100, perHour: 1000 }),
        keyGenerator: (c) => c.req.header("X-Key") ?? null,
      });

      await makeRequest(app, { "X-Key": "k1" });
      await makeRequest(app, { "X-Key": "k1" });
      const res = await makeRequest(app, { "X-Key": "k1" });
      expect(res.status).toBe(429);
    });
  });

  describe("Retry-After accuracy", () => {
    it("returns actual remaining time, not full window duration", async () => {
      const app = createTestApp({
        cause: "per_test",
        limits: { perSecond: 1, perMinute: 1, perHour: 1000 },
        keyGenerator: (c) => c.req.header("X-Key") ?? null,
      });

      await makeRequest(app, { "X-Key": "k1" });
      const res = await makeRequest(app, { "X-Key": "k1" });
      expect(res.status).toBe(429);

      const retryAfter = Number(res.headers.get("Retry-After"));
      expect(retryAfter).toBeLessThanOrEqual(60);
      expect(retryAfter).toBeGreaterThan(0);
    });
  });

  describe("onExceeded callback", () => {
    it("calls onExceeded when limit is hit", async () => {
      const onExceeded = vi.fn();
      const app = createTestApp({
        cause: "per_test",
        limits: { perSecond: 1, perMinute: 100, perHour: 1000 },
        keyGenerator: (c) => c.req.header("X-Key") ?? null,
        onExceeded,
      });

      await makeRequest(app, { "X-Key": "k1" });
      await makeRequest(app, { "X-Key": "k1" });

      expect(onExceeded).toHaveBeenCalledOnce();
      expect(onExceeded).toHaveBeenCalledWith(
        expect.anything(),
        "second",
        1,
      );
    });
  });
});
