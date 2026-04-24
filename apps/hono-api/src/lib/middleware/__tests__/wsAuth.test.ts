import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../auth.js", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("../resolveApplication.js", () => ({
  resolveApplicationById: vi.fn(),
}));

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
  },
}));

const { auth } = await import("../../auth.js");
const { db } = await import("../../../db/index.js");
const { resolveApplicationById } = await import("../resolveApplication.js");
const { authenticateWebSocket } = await import("../wsAuth.js");

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>;
const mockSelect = db.select as ReturnType<typeof vi.fn>;
const mockResolve = resolveApplicationById as unknown as ReturnType<typeof vi.fn>;

type AppRow = {
  id: string;
  domain: string;
  allowedOrigins: string[];
  organizationId: string;
};

function appRow(overrides: Partial<AppRow> = {}): AppRow {
  return {
    id: "app-1",
    domain: "example.com",
    allowedOrigins: ["example.com"],
    organizationId: "org-1",
    ...overrides,
  };
}

function chainMock(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "where", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function createMockContext(opts: {
  query?: Record<string, string>;
  headers?: Record<string, string>;
}) {
  return {
    req: {
      query: (key: string) => opts.query?.[key],
      header: (key: string) => opts.headers?.[key],
      raw: {
        headers: new Headers(opts.headers ?? {}),
      },
    },
  } as any;
}

describe("authenticateWebSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("widget auth", () => {
    it("authenticates with valid appId and visitorId", async () => {
      const c = createMockContext({
        query: {
          appId: "app-1",
          visitorId: "visitor-123",
        },
        headers: {
          Origin: "https://example.com",
        },
      });

      mockResolve.mockResolvedValue(appRow());

      const result = await authenticateWebSocket(c);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe("visitor-123");
      expect(result!.organizationId).toBe("org-1");
      expect(result!.role).toBe("visitor");
      expect(result!.authType).toBe("widget");
      expect(result!.applicationId).toBe("app-1");
    });

    it("rejects when application is not found", async () => {
      const c = createMockContext({
        query: {
          appId: "app-nonexistent",
          visitorId: "visitor-123",
        },
      });

      mockResolve.mockResolvedValue(null);

      const result = await authenticateWebSocket(c);
      expect(result).toBeNull();
    });

    it("returns null when enforceOrigin rejects", async () => {
      const c = createMockContext({
        query: {
          appId: "app-1",
          visitorId: "visitor-123",
        },
        headers: {
          Origin: "https://evil.com",
        },
      });

      mockResolve.mockResolvedValue(appRow());

      const result = await authenticateWebSocket(c);
      expect(result).toBeNull();
    });

    it("allows connection when no Origin header is present", async () => {
      const c = createMockContext({
        query: {
          appId: "app-1",
          visitorId: "visitor-123",
        },
      });

      mockResolve.mockResolvedValue(appRow());

      const result = await authenticateWebSocket(c);

      expect(result).not.toBeNull();
      expect(result!.authType).toBe("widget");
    });

    it("falls through to session auth when only appId is provided without visitorId", async () => {
      const c = createMockContext({
        query: {
          appId: "app-1",
        },
        headers: {
          "X-Tenant-Slug": "acme",
        },
      });

      mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
      mockSelect
        .mockReturnValueOnce(chainMock([{ id: "org-1" }]))
        .mockReturnValueOnce(chainMock([{ role: "admin" }]));

      const result = await authenticateWebSocket(c);

      expect(result).not.toBeNull();
      expect(result!.authType).toBe("session");
    });
  });

  describe("session auth (admin)", () => {
    it("authenticates with valid session and tenant", async () => {
      const c = createMockContext({
        headers: {
          "X-Tenant-Slug": "acme",
          Cookie: "session=abc",
        },
      });

      mockGetSession.mockResolvedValue({
        user: { id: "user-1" },
      });

      // First select: organization lookup
      const orgChain = chainMock([{ id: "org-1" }]);
      // Second select: member lookup
      const memberChain = chainMock([{ role: "admin" }]);

      mockSelect
        .mockReturnValueOnce(orgChain)
        .mockReturnValueOnce(memberChain);

      const result = await authenticateWebSocket(c);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe("user-1");
      expect(result!.organizationId).toBe("org-1");
      expect(result!.role).toBe("admin");
      expect(result!.authType).toBe("session");
    });

    it("maps super_admin role to admin", async () => {
      const c = createMockContext({
        headers: { "X-Tenant-Slug": "acme" },
      });

      mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
      mockSelect
        .mockReturnValueOnce(chainMock([{ id: "org-1" }]))
        .mockReturnValueOnce(chainMock([{ role: "super_admin" }]));

      const result = await authenticateWebSocket(c);
      expect(result!.role).toBe("admin");
    });

    it("rejects when no session exists", async () => {
      const c = createMockContext({
        headers: { "X-Tenant-Slug": "acme" },
      });

      mockGetSession.mockResolvedValue(null);

      const result = await authenticateWebSocket(c);
      expect(result).toBeNull();
    });

    it("rejects when no tenant slug provided", async () => {
      const c = createMockContext({ headers: {} });

      mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

      const result = await authenticateWebSocket(c);
      expect(result).toBeNull();
    });

    it("rejects when user is not a member of the organization", async () => {
      const c = createMockContext({
        headers: { "X-Tenant-Slug": "acme" },
      });

      mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
      mockSelect
        .mockReturnValueOnce(chainMock([{ id: "org-1" }]))
        .mockReturnValueOnce(chainMock([]));

      const result = await authenticateWebSocket(c);
      expect(result).toBeNull();
    });

    it("authenticates with sessionToken query param (cross-origin admin)", async () => {
      const c = createMockContext({
        query: { sessionToken: "bearer-token-123", tenant: "acme" },
      });

      mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
      mockSelect
        .mockReturnValueOnce(chainMock([{ id: "org-1" }]))
        .mockReturnValueOnce(chainMock([{ role: "operator" }]));

      const result = await authenticateWebSocket(c);

      expect(result).not.toBeNull();
      expect(result!.userId).toBe("user-1");
      expect(result!.role).toBe("operator");
      expect(result!.authType).toBe("session");

      // Verify getSession was called with the Authorization header
      expect(mockGetSession).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.any(Headers),
        }),
      );
      const sessionCall = mockGetSession.mock.calls[0]?.[0] as
        | { headers: Headers }
        | undefined;
      expect(sessionCall).toBeDefined();
      const calledHeaders = sessionCall!.headers;
      expect(calledHeaders.get("Authorization")).toBe("Bearer bearer-token-123");
    });
  });
});
