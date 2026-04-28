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

  selectMock.mockReturnValue({ from: fromMock });
  fromMock.mockReturnValue({ where: whereMock });
  whereMock.mockReturnValue({ limit: limitMock });
  limitMock.mockResolvedValue([]);

  return {
    db: {
      select: selectMock,
      _mocks: { selectMock, fromMock, whereMock, limitMock },
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

const { auth } = await import("../../auth.js");
const { db } = await import("../../../db/index.js");
const { requireTenantAuth, getTenantAuth } = await import("../auth.js");

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>;
const { selectMock, limitMock } = (db as any)._mocks;

function createApp() {
  const app = new Hono();
  app.use("/test", requireTenantAuth());
  app.get("/test", (c) => {
    const authCtx = getTenantAuth(c);
    return c.json({ userId: authCtx.user.id });
  });
  return app;
}

const FAKE_USER = {
  id: "user-1",
  name: "Test User",
  status: "ACTIVE",
};

const FAKE_MEMBER = {
  id: "member-1",
  role: "admin",
  userId: "user-1",
  organizationId: "org-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

describe("requireTenantAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { id: "user-1" },
    });
  });

  it("selects only needed columns from user table", async () => {
    limitMock
      .mockResolvedValueOnce([FAKE_USER])
      .mockResolvedValueOnce([FAKE_MEMBER]);

    const app = createApp();
    await app.request("/test");

    expect(selectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.anything(),
        name: expect.anything(),
        status: expect.anything(),
      })
    );

    const firstSelectCall = selectMock.mock.calls[0][0];
    const selectedColumns = Object.keys(firstSelectCall);
    expect(selectedColumns).not.toContain("email");
    expect(selectedColumns).not.toContain("image");
    expect(selectedColumns).not.toContain("emailVerified");
    expect(selectedColumns).not.toContain("isAnonymous");
  });

  it("selects only needed columns from member table", async () => {
    limitMock
      .mockResolvedValueOnce([FAKE_USER])
      .mockResolvedValueOnce([FAKE_MEMBER]);

    const app = createApp();
    await app.request("/test");

    expect(selectMock).toHaveBeenCalledTimes(2);
    const memberSelectCall = selectMock.mock.calls[1][0];
    const selectedColumns = Object.keys(memberSelectCall);
    expect(selectedColumns).toContain("id");
    expect(selectedColumns).toContain("role");
    expect(selectedColumns).toContain("userId");
    expect(selectedColumns).toContain("organizationId");
    expect(selectedColumns).not.toContain("createdAt");
    expect(selectedColumns).not.toContain("updatedAt");
  });

  it("returns 401 when no session exists", async () => {
    mockGetSession.mockResolvedValue(null);

    const app = createApp();
    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });

  it("returns 403 when user not found in database", async () => {
    limitMock.mockResolvedValueOnce([]);

    const app = createApp();
    const res = await app.request("/test");
    expect(res.status).toBe(401);
  });

  it("passes auth context to downstream handlers", async () => {
    limitMock
      .mockResolvedValueOnce([FAKE_USER])
      .mockResolvedValueOnce([FAKE_MEMBER]);

    const app = createApp();
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("user-1");
  });
});
