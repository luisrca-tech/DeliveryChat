import { describe, it, expect, vi, beforeEach } from "vitest";
import { signWsToken } from "../../security/wsToken.js";

const TEST_SECRET = "test-ws-token-secret-that-is-at-least-32-chars";

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

vi.mock("../../../env.js", () => ({
  env: {
    WS_TOKEN_SECRET: TEST_SECRET,
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

  describe("token auth (widget)", () => {
    it("authenticates with a valid signed token", async () => {
      const token = signWsToken(
        { appId: "app-1", origin: "https://example.com", visitorId: "visitor-123" },
        TEST_SECRET,
      );

      const c = createMockContext({
        query: { token },
        headers: { Origin: "https://example.com" },
      });

      mockResolve.mockResolvedValue(appRow());

      const result = await authenticateWebSocket(c);

      expect("user" in result).toBe(true);
      if (!("user" in result)) return;
      expect(result.user.userId).toBe("visitor-123");
      expect(result.user.organizationId).toBe("org-1");
      expect(result.user.role).toBe("visitor");
      expect(result.user.authType).toBe("widget");
      expect(result.user.applicationId).toBe("app-1");
    });

    it("rejects a tampered signature", async () => {
      const token = signWsToken(
        { appId: "app-1", origin: "https://example.com", visitorId: "visitor-123" },
        TEST_SECRET,
      );

      const tampered = token.slice(0, -2) + "XX";
      const c = createMockContext({
        query: { token: tampered },
        headers: { Origin: "https://example.com" },
      });

      const result = await authenticateWebSocket(c);
      expect("error" in result).toBe(true);
      if (!("error" in result)) return;
      expect(result.error).toBe("invalid_token");
    });

    it("rejects a token signed with a different secret", async () => {
      const token = signWsToken(
        { appId: "app-1", origin: "https://example.com", visitorId: "visitor-123" },
        "wrong-secret-key-that-is-long-enough",
      );

      const c = createMockContext({
        query: { token },
        headers: { Origin: "https://example.com" },
      });

      const result = await authenticateWebSocket(c);
      expect("error" in result).toBe(true);
      if (!("error" in result)) return;
      expect(result.error).toBe("invalid_token");
    });

    it("rejects an expired token", async () => {
      const token = signWsToken(
        { appId: "app-1", origin: "https://example.com", visitorId: "visitor-123" },
        TEST_SECRET,
        { ttlSeconds: -1 },
      );

      const c = createMockContext({
        query: { token },
        headers: { Origin: "https://example.com" },
      });

      const result = await authenticateWebSocket(c);
      expect("error" in result).toBe(true);
      if (!("error" in result)) return;
      expect(result.error).toBe("expired_token");
    });

    it("rejects when origin does not match token", async () => {
      const token = signWsToken(
        { appId: "app-1", origin: "https://example.com", visitorId: "visitor-123" },
        TEST_SECRET,
      );

      const c = createMockContext({
        query: { token },
        headers: { Origin: "https://evil.com" },
      });

      const result = await authenticateWebSocket(c);
      expect("error" in result).toBe(true);
      if (!("error" in result)) return;
      expect(result.error).toBe("origin_mismatch");
    });

    it("rejects when application is not found", async () => {
      const token = signWsToken(
        { appId: "app-1", origin: "https://example.com", visitorId: "visitor-123" },
        TEST_SECRET,
      );

      const c = createMockContext({
        query: { token },
        headers: { Origin: "https://example.com" },
      });

      mockResolve.mockResolvedValue(null);

      const result = await authenticateWebSocket(c);
      expect("error" in result).toBe(true);
      if (!("error" in result)) return;
      expect(result.error).toBe("app_not_found");
    });

    it("rejects replay from different origin after expiry", async () => {
      const token = signWsToken(
        { appId: "app-1", origin: "https://example.com", visitorId: "visitor-123" },
        TEST_SECRET,
        { ttlSeconds: -1 },
      );

      const c = createMockContext({
        query: { token },
        headers: { Origin: "https://attacker.com" },
      });

      const result = await authenticateWebSocket(c);
      expect("error" in result).toBe(true);
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

      const orgChain = chainMock([{ id: "org-1" }]);
      const memberChain = chainMock([{ role: "admin" }]);

      mockSelect
        .mockReturnValueOnce(orgChain)
        .mockReturnValueOnce(memberChain);

      const result = await authenticateWebSocket(c);

      expect("user" in result).toBe(true);
      if (!("user" in result)) return;
      expect(result.user.userId).toBe("user-1");
      expect(result.user.organizationId).toBe("org-1");
      expect(result.user.role).toBe("admin");
      expect(result.user.authType).toBe("session");
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
      expect("user" in result).toBe(true);
      if (!("user" in result)) return;
      expect(result.user.role).toBe("admin");
    });

    it("returns error when no session exists", async () => {
      const c = createMockContext({
        headers: { "X-Tenant-Slug": "acme" },
      });

      mockGetSession.mockResolvedValue(null);

      const result = await authenticateWebSocket(c);
      expect("error" in result).toBe(true);
      if (!("error" in result)) return;
      expect(result.error).toBe("unauthorized");
    });

    it("returns error when no tenant slug provided", async () => {
      const c = createMockContext({ headers: {} });

      mockGetSession.mockResolvedValue({ user: { id: "user-1" } });

      const result = await authenticateWebSocket(c);
      expect("error" in result).toBe(true);
    });

    it("returns error when user is not a member of the organization", async () => {
      const c = createMockContext({
        headers: { "X-Tenant-Slug": "acme" },
      });

      mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
      mockSelect
        .mockReturnValueOnce(chainMock([{ id: "org-1" }]))
        .mockReturnValueOnce(chainMock([]));

      const result = await authenticateWebSocket(c);
      expect("error" in result).toBe(true);
    });

    it("authenticates with sessionToken query param", async () => {
      const c = createMockContext({
        query: { sessionToken: "bearer-token-123", tenant: "acme" },
      });

      mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
      mockSelect
        .mockReturnValueOnce(chainMock([{ id: "org-1" }]))
        .mockReturnValueOnce(chainMock([{ role: "operator" }]));

      const result = await authenticateWebSocket(c);

      expect("user" in result).toBe(true);
      if (!("user" in result)) return;
      expect(result.user.userId).toBe("user-1");
      expect(result.user.role).toBe("operator");
      expect(result.user.authType).toBe("session");

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
