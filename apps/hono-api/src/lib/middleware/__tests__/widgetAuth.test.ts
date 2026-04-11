import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("../../../features/api-keys/api-key.service.js", () => ({
  validateOrigin: vi.fn(),
}));

const { db } = await import("../../../db/index.js");
const { validateOrigin } = await import(
  "../../../features/api-keys/api-key.service.js"
);
const { requireWidgetAuth, getWidgetAuth } = await import("../widgetAuth.js");

const mockSelect = db.select as unknown as ReturnType<typeof vi.fn>;
const mockValidateOrigin = validateOrigin as unknown as ReturnType<
  typeof vi.fn
>;

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

function createApp() {
  const app = new Hono();
  app.use("/test", requireWidgetAuth());
  app.get("/test", (c) => {
    const auth = getWidgetAuth(c);
    return c.json({ auth });
  });
  app.post("/test", async (c) => {
    const auth = getWidgetAuth(c);
    return c.json({ auth });
  });
  return app;
}

describe("requireWidgetAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when X-App-Id header is missing", async () => {
    const app = createApp();
    const res = await app.request("/test", {
      method: "GET",
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when appId is not a valid UUID", async () => {
    const app = createApp();
    const res = await app.request("/test", {
      method: "GET",
      headers: { "X-App-Id": "not-a-uuid" },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not Found");
    // DB must not be queried for malformed IDs
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns 404 when application is not found in the database", async () => {
    mockSelect.mockReturnValue(chainMock([]));

    const app = createApp();
    const res = await app.request("/test", {
      method: "GET",
      headers: { "X-App-Id": "00000000-0000-0000-0000-000000000000" },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not Found");
  });

  it("returns 404 when application is soft-deleted", async () => {
    mockSelect.mockReturnValue(chainMock([]));

    const app = createApp();
    const res = await app.request("/test", {
      method: "GET",
      headers: { "X-App-Id": "00000000-0000-0000-0000-000000000002" },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Not Found");
  });

  it("returns 403 when origin does not match registered domain", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        { id: "00000000-0000-0000-0000-000000000001", domain: "example.com", organizationId: "org-1" },
      ]),
    );
    mockValidateOrigin.mockReturnValue(false);

    const app = createApp();
    const res = await app.request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": "00000000-0000-0000-0000-000000000001",
        Origin: "https://evil.com",
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
    expect(mockValidateOrigin).toHaveBeenCalledWith(
      "https://evil.com",
      "example.com",
    );
  });

  it("allows request when origin matches registered domain", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        { id: "00000000-0000-0000-0000-000000000001", domain: "example.com", organizationId: "org-1" },
      ]),
    );
    mockValidateOrigin.mockReturnValue(true);

    const app = createApp();
    const res = await app.request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": "00000000-0000-0000-0000-000000000001",
        Origin: "https://example.com",
      },
    });

    expect(res.status).toBe(200);
    expect(mockValidateOrigin).toHaveBeenCalledWith(
      "https://example.com",
      "example.com",
    );
  });

  it("allows request when origin matches subdomain of registered domain", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        { id: "00000000-0000-0000-0000-000000000001", domain: "example.com", organizationId: "org-1" },
      ]),
    );
    mockValidateOrigin.mockReturnValue(true);

    const app = createApp();
    const res = await app.request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": "00000000-0000-0000-0000-000000000001",
        Origin: "https://shop.example.com",
      },
    });

    expect(res.status).toBe(200);
    expect(mockValidateOrigin).toHaveBeenCalledWith(
      "https://shop.example.com",
      "example.com",
    );
  });

  it("allows localhost origins in non-production environments", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    mockSelect.mockReturnValue(
      chainMock([
        { id: "00000000-0000-0000-0000-000000000001", domain: "example.com", organizationId: "org-1" },
      ]),
    );
    // validateOrigin would return false for localhost vs example.com,
    // but the middleware should bypass domain validation for localhost in dev
    mockValidateOrigin.mockReturnValue(false);

    const app = createApp();
    const res = await app.request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": "00000000-0000-0000-0000-000000000001",
        Origin: "http://localhost:3001",
      },
    });

    expect(res.status).toBe(200);
    expect(mockValidateOrigin).not.toHaveBeenCalled();

    process.env.NODE_ENV = original;
  });

  it("rejects localhost origin in production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    mockSelect.mockReturnValue(
      chainMock([
        { id: "00000000-0000-0000-0000-000000000001", domain: "example.com", organizationId: "org-1" },
      ]),
    );
    mockValidateOrigin.mockReturnValue(false);

    const app = createApp();
    const res = await app.request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": "00000000-0000-0000-0000-000000000001",
        Origin: "http://localhost:3001",
      },
    });

    expect(res.status).toBe(403);
    expect(mockValidateOrigin).toHaveBeenCalledWith(
      "http://localhost:3001",
      "example.com",
    );

    process.env.NODE_ENV = original;
  });

  it("allows request when no Origin header at all", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        { id: "00000000-0000-0000-0000-000000000001", domain: "example.com", organizationId: "org-1" },
      ]),
    );

    const app = createApp();
    const res = await app.request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": "00000000-0000-0000-0000-000000000001",
      },
    });

    expect(res.status).toBe(200);
    // validateOrigin should not be called when there is no origin
    expect(mockValidateOrigin).not.toHaveBeenCalled();
  });

  it("sets widgetAuth context correctly on success", async () => {
    mockSelect.mockReturnValue(
      chainMock([
        { id: "00000000-0000-0000-0000-000000000001", domain: "example.com", organizationId: "org-1" },
      ]),
    );
    mockValidateOrigin.mockReturnValue(true);

    const app = createApp();
    const res = await app.request("/test", {
      method: "GET",
      headers: {
        "X-App-Id": "00000000-0000-0000-0000-000000000001",
        Origin: "https://example.com",
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.auth).toEqual({
      application: { id: "00000000-0000-0000-0000-000000000001", domain: "example.com" },
      organizationId: "org-1",
    });
  });
});
