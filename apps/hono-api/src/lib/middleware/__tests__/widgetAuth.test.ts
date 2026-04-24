import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../resolveApplication.js", () => ({
  resolveApplicationById: vi.fn(),
}));

const { resolveApplicationById } = await import("../resolveApplication.js");
const { requireWidgetAuth, getWidgetAuth } = await import("../widgetAuth.js");

const mockResolve = resolveApplicationById as unknown as ReturnType<typeof vi.fn>;

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

  it("returns 404 when application is not found (invalid UUID or missing)", async () => {
    mockResolve.mockResolvedValue(null);
    const res = await createApp().request("/test", {
      method: "GET",
      headers: { "X-App-Id": "not-a-uuid" },
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when application is not found in DB", async () => {
    mockResolve.mockResolvedValue(null);
    const res = await createApp().request("/test", {
      method: "GET",
      headers: { "X-App-Id": APP_ID },
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 with origin_not_allowed when enforceOrigin rejects", async () => {
    mockResolve.mockResolvedValue(appRow());

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

  it("allows request when enforceOrigin passes", async () => {
    mockResolve.mockResolvedValue(appRow());
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": APP_ID,
        Origin: "https://example.com",
      },
    });
    expect(res.status).toBe(200);
  });

  it("allows request when Origin header is missing (requireOrigin=false)", async () => {
    mockResolve.mockResolvedValue(appRow());
    const res = await createApp().request("/test", {
      method: "GET",
      headers: { "X-App-Id": APP_ID },
    });
    expect(res.status).toBe(200);
  });

  it("sets widgetAuth context with allowedOrigins", async () => {
    mockResolve.mockResolvedValue(
      appRow({ allowedOrigins: ["example.com", "*.example.com"] }),
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
