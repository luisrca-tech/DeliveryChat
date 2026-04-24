import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createWsUpgradeRateLimitMiddleware } from "./wsRateLimit.js";

function createTestApp() {
  const app = new Hono();
  app.use("*", createWsUpgradeRateLimitMiddleware());
  app.get("/ws", (c) => c.json({ ok: true }));
  return app;
}

function makeRequest(
  app: ReturnType<typeof createTestApp>,
  ip = "192.168.1.1",
) {
  return app.request("/ws", {
    headers: { "X-Forwarded-For": ip },
  });
}

describe("createWsUpgradeRateLimitMiddleware", () => {
  it("allows requests under the per-second limit", async () => {
    const app = createTestApp();
    for (let i = 0; i < 5; i++) {
      const res = await makeRequest(app);
      expect(res.status).toBe(200);
    }
  });

  it("blocks requests exceeding per-second limit", async () => {
    const app = createTestApp();
    for (let i = 0; i < 5; i++) {
      await makeRequest(app);
    }
    const res = await makeRequest(app);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.cause).toBe("ws_upgrade");
  });

  it("rate limits by IP independently", async () => {
    const app = createTestApp();
    for (let i = 0; i < 5; i++) {
      await makeRequest(app, "10.0.0.1");
    }
    const blocked = await makeRequest(app, "10.0.0.1");
    expect(blocked.status).toBe(429);

    const allowed = await makeRequest(app, "10.0.0.2");
    expect(allowed.status).toBe(200);
  });

  it("uses CF-Connecting-IP when available", async () => {
    const app = createTestApp();
    for (let i = 0; i < 5; i++) {
      await app.request("/ws", {
        headers: { "CF-Connecting-IP": "1.2.3.4" },
      });
    }
    const blocked = await app.request("/ws", {
      headers: { "CF-Connecting-IP": "1.2.3.4" },
    });
    expect(blocked.status).toBe(429);

    const allowed = await app.request("/ws", {
      headers: { "CF-Connecting-IP": "5.6.7.8" },
    });
    expect(allowed.status).toBe(200);
  });
});
