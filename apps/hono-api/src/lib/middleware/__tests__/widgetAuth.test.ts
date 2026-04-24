import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
  },
}));

const { db } = await import("../../../db/index.js");
const { requireWidgetAuth, getWidgetAuth } = await import("../widgetAuth.js");

const mockSelect = db.select as unknown as ReturnType<typeof vi.fn>;

function chainMock(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "where", "limit"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (
    resolve: (v: unknown) => void,
    reject: (e: unknown) => void,
  ) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

type AppRow = {
  id: string;
  domain: string;
  allowedOrigins: string[];
  organizationId: string;
};

function appRow(overrides: Partial<AppRow> = {}): AppRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    domain: "example.com",
    allowedOrigins: ["example.com"],
    organizationId: "org-1",
    ...overrides,
  };
}

function createApp() {
  const app = new Hono();
  app.use("/test", requireWidgetAuth());
  app.get("/test", (c) => {
    const auth = getWidgetAuth(c);
    return c.json({ auth });
  });
  return app;
}

describe("requireWidgetAuth", () => {
  const APP_ID = "00000000-0000-0000-0000-000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when X-App-Id header is missing", async () => {
    const res = await createApp().request("/test", { method: "GET" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when appId is not a valid UUID", async () => {
    const res = await createApp().request("/test", {
      method: "GET",
      headers: { "X-App-Id": "not-a-uuid" },
    });
    expect(res.status).toBe(404);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns 404 when application is not found", async () => {
    mockSelect.mockReturnValue(chainMock([]));
    const res = await createApp().request("/test", {
      method: "GET",
      headers: { "X-App-Id": APP_ID },
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 with origin_not_allowed when origin is outside allow-list", async () => {
    mockSelect.mockReturnValue(chainMock([appRow()]));

    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": APP_ID,
        Origin: "https://evil.com",
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("origin_not_allowed");
  });

  it("allows request when origin exactly matches an allow-list entry", async () => {
    mockSelect.mockReturnValue(chainMock([appRow()]));
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": APP_ID,
        Origin: "https://example.com",
      },
    });
    expect(res.status).toBe(200);
  });

  it("allows wildcard entry for subdomain", async () => {
    mockSelect.mockReturnValue(
      chainMock([appRow({ allowedOrigins: ["*.example.com"] })]),
    );
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": APP_ID,
        Origin: "https://shop.example.com",
      },
    });
    expect(res.status).toBe(200);
  });

  it("rejects subdomain when entry is non-wildcard", async () => {
    mockSelect.mockReturnValue(chainMock([appRow()]));
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": APP_ID,
        Origin: "https://evil.example.com",
      },
    });
    expect(res.status).toBe(403);
  });

  it("allows localhost in non-production for dev ergonomics", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    mockSelect.mockReturnValue(chainMock([appRow()]));
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": APP_ID,
        Origin: "http://localhost:3001",
      },
    });
    expect(res.status).toBe(200);

    process.env.NODE_ENV = original;
  });

  it("rejects localhost in production unless explicitly in allow-list", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    mockSelect.mockReturnValue(chainMock([appRow()]));
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": APP_ID,
        Origin: "http://localhost:3001",
      },
    });
    expect(res.status).toBe(403);

    process.env.NODE_ENV = original;
  });

  it("allows request when Origin header is missing", async () => {
    mockSelect.mockReturnValue(chainMock([appRow()]));
    const res = await createApp().request("/test", {
      method: "GET",
      headers: { "X-App-Id": APP_ID },
    });
    expect(res.status).toBe(200);
  });

  it("sets widgetAuth context with allowedOrigins", async () => {
    mockSelect.mockReturnValue(
      chainMock([appRow({ allowedOrigins: ["example.com", "*.example.com"] })]),
    );
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": APP_ID,
        Origin: "https://example.com",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.auth).toEqual({
      application: {
        id: APP_ID,
        domain: "example.com",
        allowedOrigins: ["example.com", "*.example.com"],
      },
      organizationId: "org-1",
    });
  });
});
