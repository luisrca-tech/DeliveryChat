import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { signWsToken, verifyWsToken } from "../../lib/security/wsToken.js";

const TEST_SECRET = "test-ws-token-secret-that-is-at-least-32-chars";
const VALID_APP_ID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_ORG_ID = "org-1";
const VALID_VISITOR_ID = "visitor-123";

vi.mock("../../env.js", () => ({
  env: {
    WS_TOKEN_SECRET: TEST_SECRET,
  },
}));

vi.mock("../../lib/middleware/widgetAuth.js", () => {
  let storedAuth: unknown = null;
  return {
    requireWidgetAuth: () => {
      return async (c: any, next: () => Promise<void>) => {
        const appId = c.req.header("X-App-Id");
        if (!appId || appId === "invalid") {
          return c.json({ error: "unauthorized" }, 401);
        }
        storedAuth = {
          application: {
            id: appId,
            domain: "example.com",
            allowedOrigins: ["example.com"],
            organizationId: VALID_ORG_ID,
          },
          organizationId: VALID_ORG_ID,
        };
        c.set("widgetAuth", storedAuth);
        await next();
      };
    },
    getWidgetAuth: (c: any) => c.get("widgetAuth") ?? null,
  };
});

vi.mock("../../db/index.js", () => ({ db: {} }));
vi.mock("../../db/schema/messages.js", () => ({ messages: {} }));
vi.mock("../../db/schema/users.js", () => ({ user: {} }));
vi.mock("../../db/schema/conversations.js", () => ({ conversations: {} }));
vi.mock("../../features/applications/application.service.js", () => ({
  getApplicationSettings: vi.fn(),
}));
vi.mock("../../features/chat/chat.service.js", () => ({
  createConversation: vi.fn(),
  getUnreadCountForVisitor: vi.fn(),
  markAsRead: vi.fn(),
}));
vi.mock("./../../routes/ws.js", () => ({
  roomManager: { broadcastToOrganization: vi.fn() },
}));
vi.mock("../../lib/middleware/visitorRateLimit.js", () => ({
  createVisitorRateLimitMiddleware: () => async (_c: any, next: () => Promise<void>) => next(),
  createVisitorWsRateLimiter: () => ({ check: () => ({ allowed: true }) }),
}));
vi.mock("../../lib/middleware/visitorRateLimitInstance.js", () => ({
  sharedVisitorRateLimiter: { check: () => ({ allowed: true }) },
}));
vi.mock("../../lib/planLimits.js", () => ({
  VISITOR_RATE_LIMITS: { perSecond: 10, perMinute: 60, perHour: 600 },
}));

const { widgetRoute } = await import("../widget.js");

const app = new Hono().route("/widget", widgetRoute);

describe("POST /widget/ws-token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("issues a valid signed token", async () => {
    const res = await app.request("/widget/ws-token", {
      method: "POST",
      headers: {
        "X-App-Id": VALID_APP_ID,
        "X-Visitor-Id": VALID_VISITOR_ID,
        Origin: "https://example.com",
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();

    const result = verifyWsToken(body.token, TEST_SECRET);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.payload.appId).toBe(VALID_APP_ID);
    expect(result.payload.origin).toBe("https://example.com");
    expect(result.payload.visitorId).toBe(VALID_VISITOR_ID);
  });

  it("rejects when X-Visitor-Id is missing", async () => {
    const res = await app.request("/widget/ws-token", {
      method: "POST",
      headers: {
        "X-App-Id": VALID_APP_ID,
        Origin: "https://example.com",
      },
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("X-Visitor-Id");
  });

  it("rejects when X-App-Id is missing (widgetAuth rejects)", async () => {
    const res = await app.request("/widget/ws-token", {
      method: "POST",
      headers: {
        "X-Visitor-Id": VALID_VISITOR_ID,
      },
    });

    expect(res.status).toBe(401);
  });

  it("signs token with empty origin when Origin header is absent (accepted residual risk)", async () => {
    const res = await app.request("/widget/ws-token", {
      method: "POST",
      headers: {
        "X-App-Id": VALID_APP_ID,
        "X-Visitor-Id": VALID_VISITOR_ID,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();

    const result = verifyWsToken(body.token, TEST_SECRET);
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.payload.origin).toBe("");
  });
});
