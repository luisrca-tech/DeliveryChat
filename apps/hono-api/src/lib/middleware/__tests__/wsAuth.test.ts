import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../auth.js", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("../../../features/api-keys/api-key.service.js", () => ({
  verifyApiKey: vi.fn(),
}));

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
  },
}));

const { auth } = await import("../../auth.js");
const { verifyApiKey } = await import(
  "../../../features/api-keys/api-key.service.js"
);
const { db } = await import("../../../db/index.js");
const { authenticateWebSocket } = await import("../wsAuth.js");

const mockGetSession = auth.api.getSession as unknown as ReturnType<typeof vi.fn>;
const mockVerifyApiKey = verifyApiKey as ReturnType<typeof vi.fn>;
const mockSelect = db.select as ReturnType<typeof vi.fn>;

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

  describe("API key auth (widget)", () => {
    it("authenticates with valid token and appId", async () => {
      const c = createMockContext({
        query: {
          token: "dk_live_abcdefghijklmnopqrstuvwxyz123456",
          appId: "app-1",
        },
      });

      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        application: { id: "app-1", domain: "example.com" },
        apiKey: { id: "key-1" },
      });

      mockSelect.mockReturnValue(
        chainMock([{ organizationId: "org-1" }]),
      );

      const result = await authenticateWebSocket(c);

      expect(result).not.toBeNull();
      expect(result!.organizationId).toBe("org-1");
      expect(result!.role).toBe("visitor");
      expect(result!.authType).toBe("apiKey");
      expect(result!.applicationId).toBe("app-1");
    });

    it("uses visitorId when provided", async () => {
      const c = createMockContext({
        query: {
          token: "dk_live_abcdefghijklmnopqrstuvwxyz123456",
          appId: "app-1",
          visitorId: "visitor-123",
        },
      });

      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        application: { id: "app-1", domain: "example.com" },
        apiKey: { id: "key-1" },
      });

      mockSelect.mockReturnValue(
        chainMock([{ organizationId: "org-1" }]),
      );

      const result = await authenticateWebSocket(c);
      expect(result!.userId).toBe("visitor-123");
    });

    it("generates anonymous userId when visitorId not provided", async () => {
      const c = createMockContext({
        query: {
          token: "dk_live_abcdefghijklmnopqrstuvwxyz123456",
          appId: "app-1",
        },
      });

      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        application: { id: "app-1", domain: "example.com" },
        apiKey: { id: "key-1" },
      });

      mockSelect.mockReturnValue(
        chainMock([{ organizationId: "org-1" }]),
      );

      const result = await authenticateWebSocket(c);
      expect(result!.userId).toMatch(/^anonymous-/);
    });

    it("rejects invalid API key format", async () => {
      const c = createMockContext({
        query: { token: "bad-key", appId: "app-1" },
      });

      const result = await authenticateWebSocket(c);
      expect(result).toBeNull();
    });

    it("rejects when verifyApiKey returns invalid", async () => {
      const c = createMockContext({
        query: {
          token: "dk_live_abcdefghijklmnopqrstuvwxyz123456",
          appId: "app-1",
        },
      });

      mockVerifyApiKey.mockResolvedValue({ valid: false, reason: "revoked" });

      const result = await authenticateWebSocket(c);
      expect(result).toBeNull();
    });

    it("rejects when appId does not match", async () => {
      const c = createMockContext({
        query: {
          token: "dk_live_abcdefghijklmnopqrstuvwxyz123456",
          appId: "app-wrong",
        },
      });

      mockVerifyApiKey.mockResolvedValue({
        valid: true,
        application: { id: "app-1", domain: "example.com" },
        apiKey: { id: "key-1" },
      });

      const result = await authenticateWebSocket(c);
      expect(result).toBeNull();
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
