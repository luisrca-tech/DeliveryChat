import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { identifyRoute } from "./identify.route.js";

const mockUpsert = vi.fn();
const mockVerifyHmac = vi.fn();

vi.mock("./identity.service.js", () => ({
  upsertVisitorIdentity: (...args: unknown[]) => mockUpsert(...args),
}));

vi.mock("./hmac.service.js", () => ({
  verifyHmac: (...args: unknown[]) => mockVerifyHmac(...args),
}));

let mockOrgRow: Record<string, unknown> | null = null;

vi.mock("../../lib/middleware/widgetAuth.js", () => ({
  requireWidgetAuth: () => async (_c: unknown, next: () => Promise<void>) => next(),
  getWidgetAuth: (c: { get: (key: string) => unknown }) => c.get("widgetAuth") ?? null,
}));

vi.mock("../../db/index.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => (mockOrgRow ? [mockOrgRow] : [])),
        })),
      })),
    })),
  },
}));

function createApp(widgetAuthOverrides?: Partial<{
  organizationId: string;
  application: { id: string; organizationId: string };
}>) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c as any).set("widgetAuth", {
      application: { id: "app-1", organizationId: "org-1" },
      organizationId: "org-1",
      ...widgetAuthOverrides,
    });
    await next();
  });

  app.route("/", identifyRoute);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOrgRow = null;
});

describe("POST /identify", () => {
  it("returns 400 when X-Visitor-Id header is missing", async () => {
    const app = createApp();
    const res = await app.request("/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });

    expect(res.status).toBe(400);
  });

  it("upserts identity and returns 200 when verification is disabled", async () => {
    const mockRecord = {
      id: "id-1",
      anonymousUserId: "visitor-1",
      organizationId: "org-1",
      externalId: "ext-1",
      email: "test@example.com",
      name: "Test User",
      hmacVerified: false,
    };
    mockUpsert.mockResolvedValue(mockRecord);

    const app = createApp();
    const res = await app.request("/identify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Visitor-Id": "visitor-1",
      },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        externalId: "ext-1",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.identity).toEqual(mockRecord);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        anonymousUserId: "visitor-1",
        organizationId: "org-1",
        name: "Test User",
        email: "test@example.com",
        externalId: "ext-1",
        hmacVerified: false,
      }),
    );
  });

  it("returns 400 when body is empty (no identity fields)", async () => {
    const app = createApp();
    const res = await app.request("/identify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Visitor-Id": "visitor-1",
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("accepts metadata as a JSON object", async () => {
    mockUpsert.mockResolvedValue({ id: "id-1" });

    const app = createApp();
    const res = await app.request("/identify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Visitor-Id": "visitor-1",
      },
      body: JSON.stringify({
        name: "User",
        metadata: { tier: "premium", seats: 5 },
      }),
    });

    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { tier: "premium", seats: 5 },
      }),
    );
  });

  it("returns 403 when verification enabled but hmac missing", async () => {
    mockOrgRow = {
      identityVerificationEnabled: true,
      identityVerificationSecret: "secret-key",
    };

    const app = createApp();
    const res = await app.request("/identify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Visitor-Id": "visitor-1",
      },
      body: JSON.stringify({ name: "User", externalId: "ext-1" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 403 when verification enabled but externalId missing", async () => {
    mockOrgRow = {
      identityVerificationEnabled: true,
      identityVerificationSecret: "secret-key",
    };

    const app = createApp();
    const res = await app.request("/identify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Visitor-Id": "visitor-1",
      },
      body: JSON.stringify({ name: "User", hmac: "some-hmac" }),
    });

    expect(res.status).toBe(403);
  });

  it("returns 403 when HMAC signature is invalid", async () => {
    mockOrgRow = {
      identityVerificationEnabled: true,
      identityVerificationSecret: "secret-key",
    };
    mockVerifyHmac.mockReturnValue(false);

    const app = createApp();
    const res = await app.request("/identify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Visitor-Id": "visitor-1",
      },
      body: JSON.stringify({
        name: "User",
        externalId: "ext-1",
        hmac: "bad-signature",
      }),
    });

    expect(res.status).toBe(403);
    expect(mockVerifyHmac).toHaveBeenCalledWith("secret-key", "ext-1", "bad-signature");
  });

  it("upserts with hmacVerified=true when signature is valid", async () => {
    mockOrgRow = {
      identityVerificationEnabled: true,
      identityVerificationSecret: "secret-key",
    };
    mockVerifyHmac.mockReturnValue(true);
    mockUpsert.mockResolvedValue({ id: "id-1", hmacVerified: true });

    const app = createApp();
    const res = await app.request("/identify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Visitor-Id": "visitor-1",
      },
      body: JSON.stringify({
        name: "User",
        externalId: "ext-1",
        hmac: "valid-signature",
      }),
    });

    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ hmacVerified: true }),
    );
  });
});
