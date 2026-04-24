import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { createVisitorRateLimitMiddleware } from "./visitorRateLimit.js";

function makeRequest(app: Hono, headers: Record<string, string>) {
  return app.request("/test", { headers });
}

describe("visitor rate limit composition behavior", () => {
  it("per-visitor limit fires independently of other middleware", async () => {
    const app = new Hono();

    let tenantLimiterCalled = false;
    app.use(
      "*",
      createVisitorRateLimitMiddleware({
        perSecond: 2,
        perMinute: 100,
        perHour: 1000,
      }),
    );

    app.use("*", async (_c, next) => {
      tenantLimiterCalled = true;
      await next();
    });

    app.get("/test", (c) => c.json({ ok: true }));

    const headers = { "X-App-Id": "app1", "X-Visitor-Id": "visitor1" };

    await makeRequest(app, headers);
    await makeRequest(app, headers);
    const res = await makeRequest(app, headers);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.cause).toBe("per_visitor");
  });

  it("two visitors under one tenant have independent budgets", async () => {
    const app = new Hono();

    app.use(
      "*",
      createVisitorRateLimitMiddleware({
        perSecond: 1,
        perMinute: 100,
        perHour: 1000,
      }),
    );

    app.get("/test", (c) => c.json({ ok: true }));

    const r1 = await makeRequest(app, { "X-App-Id": "a", "X-Visitor-Id": "v1" });
    expect(r1.status).toBe(200);

    const r2 = await makeRequest(app, { "X-App-Id": "a", "X-Visitor-Id": "v2" });
    expect(r2.status).toBe(200);

    const r3 = await makeRequest(app, { "X-App-Id": "a", "X-Visitor-Id": "v1" });
    expect(r3.status).toBe(429);

    const r4 = await makeRequest(app, { "X-App-Id": "a", "X-Visitor-Id": "v2" });
    expect(r4.status).toBe(429);
  });

  it("429 response includes Retry-After header and per_visitor cause", async () => {
    const app = new Hono();
    app.use(
      "*",
      createVisitorRateLimitMiddleware({
        perSecond: 1,
        perMinute: 100,
        perHour: 1000,
      }),
    );
    app.get("/test", (c) => c.json({ ok: true }));

    await makeRequest(app, { "X-App-Id": "a", "X-Visitor-Id": "v" });
    const res = await makeRequest(app, { "X-App-Id": "a", "X-Visitor-Id": "v" });

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1");
    const body = await res.json();
    expect(body.cause).toBe("per_visitor");
    expect(body.error).toBe("Rate limit exceeded");
    expect(body.retryAfter).toBe(1);
  });

  it("different apps have independent visitor budgets", async () => {
    const app = new Hono();
    app.use(
      "*",
      createVisitorRateLimitMiddleware({
        perSecond: 1,
        perMinute: 100,
        perHour: 1000,
      }),
    );
    app.get("/test", (c) => c.json({ ok: true }));

    const r1 = await makeRequest(app, { "X-App-Id": "appA", "X-Visitor-Id": "v1" });
    expect(r1.status).toBe(200);

    const r2 = await makeRequest(app, { "X-App-Id": "appB", "X-Visitor-Id": "v1" });
    expect(r2.status).toBe(200);

    const r3 = await makeRequest(app, { "X-App-Id": "appA", "X-Visitor-Id": "v1" });
    expect(r3.status).toBe(429);
  });
});
