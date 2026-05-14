import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../auth.js", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("../../../db/index.js", () => {
  const selectMock = vi.fn();
  const fromMock = vi.fn();
  const whereMock = vi.fn();
  const limitMock = vi.fn();
  const insertMock = vi.fn();
  const valuesMock = vi.fn();
  const onConflictDoNothingMock = vi.fn();

  selectMock.mockReturnValue({ from: fromMock });
  fromMock.mockReturnValue({ where: whereMock });
  whereMock.mockReturnValue({ limit: limitMock });
  limitMock.mockResolvedValue([]);

  insertMock.mockReturnValue({ values: valuesMock });
  valuesMock.mockReturnValue({ onConflictDoNothing: onConflictDoNothingMock });
  onConflictDoNothingMock.mockResolvedValue(undefined);

  return {
    db: {
      select: selectMock,
      insert: insertMock,
      _mocks: {
        selectMock,
        fromMock,
        whereMock,
        limitMock,
        insertMock,
        valuesMock,
        onConflictDoNothingMock,
      },
    },
  };
});

vi.mock("../../tenant.js", () => ({
  getHostSubdomain: vi.fn().mockReturnValue("test-tenant"),
  resolveOrganizationBySubdomain: vi.fn().mockResolvedValue({
    id: "org-1",
    name: "Test Org",
    slug: "test-tenant",
    status: "ACTIVE",
  }),
}));

vi.mock("../../requestContext.js", () => ({
  getTenantSlugFromExplicitHeader: vi.fn().mockReturnValue(null),
  getTenantSlugFromHeaders: vi.fn().mockReturnValue("test-tenant"),
}));

vi.mock("../../accountLifecycle.js", () => ({
  resolveLoginOutcome: vi.fn().mockReturnValue("ALLOW"),
  getStatusSpecificErrorMessage: vi.fn().mockReturnValue(""),
}));

vi.mock("../../../features/api-keys/api-key.service.js", () => ({
  verifyApiKey: vi.fn(),
  touchLastUsed: vi.fn(),
}));

vi.mock("../../../features/chat/visitor.service.js", () => ({
  resolveOrCreateVisitor: vi.fn(),
}));

const { auth } = await import("../../auth.js");
const { db } = await import("../../../db/index.js");
const { verifyApiKey, touchLastUsed } = await import(
  "../../../features/api-keys/api-key.service.js"
);
const { resolveOrCreateVisitor } = await import(
  "../../../features/chat/visitor.service.js"
);
const { requireAuth, getUnifiedAuth, requireMember } = await import(
  "../unifiedAuth.js"
);

const mockGetSession = auth.api.getSession as unknown as ReturnType<
  typeof vi.fn
>;
const { selectMock, limitMock } = (db as any)._mocks;
const mockVerify = verifyApiKey as unknown as ReturnType<typeof vi.fn>;
const mockTouch = touchLastUsed as unknown as ReturnType<typeof vi.fn>;
const mockResolveVisitor = resolveOrCreateVisitor as unknown as ReturnType<
  typeof vi.fn
>;

const FAKE_USER = { id: "user-1", name: "Test User", status: "ACTIVE" };
const FAKE_MEMBER = {
  id: "member-1",
  role: "admin",
  userId: "user-1",
  organizationId: "org-1",
};

function validLiveKey() {
  return "dk_live_" + "a".repeat(32);
}

function validApiResult() {
  return {
    valid: true as const,
    application: {
      id: "app-1",
      domain: "example.com",
      allowedOrigins: ["example.com"],
      organizationId: "org-1",
    },
    apiKey: { id: "key-1", environment: "live" as const },
  };
}

function createAuthApp() {
  const app = new Hono();
  app.use("/test", requireAuth());
  app.get("/test", (c) => {
    const authCtx = getUnifiedAuth(c);
    return c.json(authCtx);
  });
  return app;
}

function createMemberGuardApp() {
  const app = new Hono();
  app.use("/test", requireAuth());
  app.use("/test", requireMember());
  app.get("/test", (c) => {
    const authCtx = getUnifiedAuth(c);
    return c.json(authCtx);
  });
  return app;
}

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(null);
    mockTouch.mockReturnValue(undefined);
  });

  describe("member auth (session path)", () => {
    it("produces member context when session is valid", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
      limitMock
        .mockResolvedValueOnce([FAKE_USER])
        .mockResolvedValueOnce([FAKE_MEMBER]);

      const res = await createAuthApp().request("/test");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe("member");
      expect(body.user.id).toBe("user-1");
      expect(body.membership.role).toBe("admin");
      expect(body.organization.id).toBe("org-1");
    });
  });

  describe("visitor auth (API key path)", () => {
    it("produces visitor context when API key and visitor ID are valid", async () => {
      mockVerify.mockResolvedValue(validApiResult());
      mockResolveVisitor.mockResolvedValue("visitor-user-1");

      const visitorId = "550e8400-e29b-41d4-a716-446655440000";
      const res = await createAuthApp().request("/test", {
        headers: {
          Authorization: `Bearer ${validLiveKey()}`,
          "X-App-Id": "app-1",
          "X-Visitor-Id": visitorId,
          Origin: "https://example.com",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe("visitor");
      expect(body.visitorId).toBe(visitorId);
      expect(body.visitorUserId).toBe("visitor-user-1");
      expect(body.application.id).toBe("app-1");
      expect(body.apiKey.id).toBe("key-1");
    });
  });

  describe("fallback order", () => {
    it("tries session auth first, falls back to API key", async () => {
      mockGetSession.mockResolvedValue(null);
      mockVerify.mockResolvedValue(validApiResult());
      mockResolveVisitor.mockResolvedValue("visitor-user-1");

      const visitorId = "550e8400-e29b-41d4-a716-446655440000";
      const res = await createAuthApp().request("/test", {
        headers: {
          Authorization: `Bearer ${validLiveKey()}`,
          "X-App-Id": "app-1",
          "X-Visitor-Id": visitorId,
          Origin: "https://example.com",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe("visitor");
      expect(mockGetSession).toHaveBeenCalledTimes(1);
    });

    it("uses session path when session exists even if API key headers present", async () => {
      mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
      limitMock
        .mockResolvedValueOnce([FAKE_USER])
        .mockResolvedValueOnce([FAKE_MEMBER]);

      const res = await createAuthApp().request("/test", {
        headers: {
          Authorization: `Bearer ${validLiveKey()}`,
          "X-App-Id": "app-1",
          "X-Visitor-Id": "550e8400-e29b-41d4-a716-446655440000",
          Origin: "https://example.com",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.type).toBe("member");
      expect(mockVerify).not.toHaveBeenCalled();
    });
  });

  describe("rejection cases", () => {
    it("returns 401 when neither session nor API key provided", async () => {
      const res = await createAuthApp().request("/test");

      expect(res.status).toBe(401);
    });

    it("returns 401 when API key format is invalid", async () => {
      const res = await createAuthApp().request("/test", {
        headers: {
          Authorization: "Bearer bad-key",
          "X-App-Id": "app-1",
          "X-Visitor-Id": "550e8400-e29b-41d4-a716-446655440000",
        },
      });

      expect(res.status).toBe(401);
    });

    it("returns 400 when API key valid but X-Visitor-Id missing", async () => {
      mockVerify.mockResolvedValue(validApiResult());

      const res = await createAuthApp().request("/test", {
        headers: {
          Authorization: `Bearer ${validLiveKey()}`,
          "X-App-Id": "app-1",
          Origin: "https://example.com",
        },
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 when X-Visitor-Id is not a valid UUID", async () => {
      mockVerify.mockResolvedValue(validApiResult());

      const res = await createAuthApp().request("/test", {
        headers: {
          Authorization: `Bearer ${validLiveKey()}`,
          "X-App-Id": "app-1",
          "X-Visitor-Id": "not-a-uuid",
          Origin: "https://example.com",
        },
      });

      expect(res.status).toBe(400);
    });
  });
});

describe("requireMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(null);
    mockTouch.mockReturnValue(undefined);
  });

  it("allows member auth through", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    limitMock
      .mockResolvedValueOnce([FAKE_USER])
      .mockResolvedValueOnce([FAKE_MEMBER]);

    const res = await createMemberGuardApp().request("/test");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("member");
  });

  it("returns 403 for visitor auth", async () => {
    mockVerify.mockResolvedValue(validApiResult());
    mockResolveVisitor.mockResolvedValue("visitor-user-1");

    const res = await createMemberGuardApp().request("/test", {
      headers: {
        Authorization: `Bearer ${validLiveKey()}`,
        "X-App-Id": "app-1",
        "X-Visitor-Id": "550e8400-e29b-41d4-a716-446655440000",
        Origin: "https://example.com",
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });
});
