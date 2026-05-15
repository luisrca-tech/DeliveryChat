import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";

vi.mock("../../features/rate-limiting/rateLimitConfig.service.js", () => ({
  getRateLimitsForTenant: vi.fn().mockResolvedValue({
    perSecond: 2,
    perMinute: 100,
    perHour: 1000,
  }),
}));

vi.mock("../../features/rate-limiting/rateLimitAlert.service.js", () => ({
  recordRateLimitExceeded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./unifiedAuth.js", () => ({
  getUnifiedAuth: (c: { get: (key: string) => unknown }) =>
    c.get("unifiedAuth"),
  requireAuth: () => async (_c: any, next: () => Promise<void>) => next(),
  requireMember: () => async (_c: any, next: () => Promise<void>) => next(),
}));

import { createUnifiedRateLimitMiddleware } from "./unifiedRateLimit.js";

type UnifiedAuthContext =
  | {
      type: "member";
      session: any;
      user: { id: string; name: string };
      organization: { id: string; plan: string } & Record<string, unknown>;
      membership: {
        id: string;
        role: string;
        userId: string;
        organizationId: string;
      };
    }
  | {
      type: "visitor";
      visitorId: string;
      visitorUserId: string;
      application: { id: string; organizationId: string } & Record<
        string,
        unknown
      >;
      apiKey: { id: string; environment: "live" | "test" };
    };

function createMemberAuth(orgId = "org-1"): UnifiedAuthContext {
  return {
    type: "member",
    session: {} as any,
    user: { id: "user-1", name: "Test User" },
    organization: { id: orgId, plan: "FREE" } as any,
    membership: {
      id: "m-1",
      role: "operator",
      userId: "user-1",
      organizationId: orgId,
    },
  };
}

function createVisitorAuth(
  appId = "app-1",
  visitorId = "v-1",
  visitorUserId = "vu-1",
): UnifiedAuthContext {
  return {
    type: "visitor",
    visitorId,
    visitorUserId,
    application: {
      id: appId,
      organizationId: "org-1",
      allowedOrigins: [],
    } as any,
    apiKey: { id: "key-1", environment: "live" },
  };
}

function createTestApp(authContext: UnifiedAuthContext) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    (c as any).set("unifiedAuth", authContext);
    await next();
  });
  app.use("*", createUnifiedRateLimitMiddleware());
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("createUnifiedRateLimitMiddleware", () => {
  describe("member auth path", () => {
    it("allows requests under the tenant limit", async () => {
      const app = createTestApp(createMemberAuth());
      const res = await app.request("/test");
      expect(res.status).toBe(200);
    });

    it("returns 429 with per_tenant cause when tenant limit exceeded", async () => {
      const app = createTestApp(createMemberAuth("org-rate-test"));

      await app.request("/test");
      await app.request("/test");
      const res = await app.request("/test");

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.cause).toBe("per_tenant");
    });

    it("uses org ID as rate limit key (independent per org)", async () => {
      const app1 = createTestApp(createMemberAuth("org-a"));
      const app2 = createTestApp(createMemberAuth("org-b"));

      await app1.request("/test");
      await app1.request("/test");
      const r1 = await app1.request("/test");
      expect(r1.status).toBe(429);

      const r2 = await app2.request("/test");
      expect(r2.status).toBe(200);
    });
  });

  describe("visitor auth path", () => {
    it("allows requests under the visitor limit", async () => {
      const app = createTestApp(createVisitorAuth("app-1", "v-1", "vu-1"));
      const res = await app.request("/test");
      expect(res.status).toBe(200);
    });

    it("returns 429 with per_visitor cause when visitor limit exceeded", async () => {
      const app = createTestApp(createVisitorAuth("app-2", "v-2", "vu-2"));

      // VISITOR_RATE_LIMITS.perSecond = 3
      await app.request("/test");
      await app.request("/test");
      await app.request("/test");
      const res = await app.request("/test");

      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.cause).toBe("per_visitor");
    });

    it("uses visitor ID + app ID as rate limit key (independent per visitor)", async () => {
      const app1 = createTestApp(createVisitorAuth("app-3", "v-3a", "vu-3a"));
      const app2 = createTestApp(createVisitorAuth("app-3", "v-3b", "vu-3b"));

      await app1.request("/test");
      await app1.request("/test");
      await app1.request("/test");
      const r1 = await app1.request("/test");
      expect(r1.status).toBe(429);

      const r2 = await app2.request("/test");
      expect(r2.status).toBe(200);
    });
  });

  describe("bucket isolation", () => {
    it("visitor abuse does not consume the tenant rate limit bucket", async () => {
      const visitorApp = createTestApp(
        createVisitorAuth("app-iso", "v-iso", "vu-iso"),
      );
      const memberApp = createTestApp(createMemberAuth("org-iso"));

      // Exhaust visitor bucket
      await visitorApp.request("/test");
      await visitorApp.request("/test");
      await visitorApp.request("/test");
      const visitorRes = await visitorApp.request("/test");
      expect(visitorRes.status).toBe(429);

      // Member should still be fine
      const memberRes = await memberApp.request("/test");
      expect(memberRes.status).toBe(200);
    });
  });

  describe("rate limit headers", () => {
    it("returns Retry-After header on 429", async () => {
      const app = createTestApp(
        createVisitorAuth("app-hdr", "v-hdr", "vu-hdr"),
      );

      await app.request("/test");
      await app.request("/test");
      await app.request("/test");
      const res = await app.request("/test");

      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBeTruthy();
      const retryAfter = Number(res.headers.get("Retry-After"));
      expect(retryAfter).toBeGreaterThan(0);
    });
  });
});
