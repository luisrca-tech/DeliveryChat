import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AuthorizeResult } from "../resolveApplication.js";

vi.mock("../resolveApplication.js", () => ({
  resolveAndEnforceOrigin: vi.fn(),
}));

const { resolveAndEnforceOrigin } = await import("../resolveApplication.js");
const { requireWidgetAuth, getWidgetAuth } = await import("../widgetAuth.js");

const mockAuthorize = resolveAndEnforceOrigin as unknown as ReturnType<typeof vi.fn>;

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

function authorizedResult(app: AppRow = appRow()): AuthorizeResult {
  return { authorized: true, application: app };
}

function rejectedResult(overrides: Partial<{ status: 403 | 404; error: string; message: string }> = {}): AuthorizeResult {
  return {
    authorized: false,
    status: overrides.status ?? 403,
    error: overrides.error ?? "origin_not_allowed",
    message: overrides.message ?? "Origin is not in the application allow-list",
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

  it("returns 404 when application is not found", async () => {
    mockAuthorize.mockResolvedValue(rejectedResult({ status: 404, error: "app_not_found", message: "Application not found" }));
    const res = await createApp().request("/test", {
      method: "GET",
      headers: { "X-App-Id": APP_ID },
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 with origin_not_allowed when origin is rejected", async () => {
    mockAuthorize.mockResolvedValue(rejectedResult());

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

  it("allows request when authorization passes", async () => {
    mockAuthorize.mockResolvedValue(authorizedResult());
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": APP_ID,
        Origin: "https://example.com",
      },
    });
    expect(res.status).toBe(200);
  });

  it("allows request when Origin header is missing", async () => {
    mockAuthorize.mockResolvedValue(authorizedResult());
    const res = await createApp().request("/test", {
      method: "GET",
      headers: { "X-App-Id": APP_ID },
    });
    expect(res.status).toBe(200);
  });

  it("sets widgetAuth context with application data", async () => {
    const app = appRow({ allowedOrigins: ["example.com", "*.example.com"] });
    mockAuthorize.mockResolvedValue(authorizedResult(app));
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
      application: app,
      organizationId: "org-1",
    });
  });

  it("passes appId and origin to resolveAndEnforceOrigin", async () => {
    mockAuthorize.mockResolvedValue(authorizedResult());
    await createApp().request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": APP_ID,
        Origin: "https://example.com",
      },
    });
    expect(mockAuthorize).toHaveBeenCalledWith(APP_ID, "https://example.com");
  });
});
