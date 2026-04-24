import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../../../features/api-keys/api-key.service.js", () => ({
  verifyApiKey: vi.fn(),
  touchLastUsed: vi.fn(),
}));

const { verifyApiKey, touchLastUsed } = await import(
  "../../../features/api-keys/api-key.service.js"
);
const { requireApiKeyAuth, getApiAuth } = await import("../apiKeyAuth.js");

const mockVerify = verifyApiKey as unknown as ReturnType<typeof vi.fn>;
const mockTouch = touchLastUsed as unknown as ReturnType<typeof vi.fn>;

function validLiveKey() {
  return "dk_live_" + "a".repeat(32);
}

function validTestKey() {
  return "dk_test_" + "a".repeat(32);
}

function validResult(overrides: {
  environment?: "live" | "test";
  allowedOrigins?: string[];
} = {}) {
  return {
    valid: true as const,
    application: {
      id: "app-1",
      domain: "example.com",
      allowedOrigins: overrides.allowedOrigins ?? ["example.com"],
    },
    apiKey: { id: "key-1", environment: overrides.environment ?? "live" },
  };
}

function createApp() {
  const app = new Hono();
  app.use("/test", requireApiKeyAuth());
  app.get("/test", (c) => c.json({ auth: getApiAuth(c) }));
  return app;
}

describe("requireApiKeyAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTouch.mockReturnValue(undefined);
  });

  it("rejects missing Authorization header", async () => {
    const res = await createApp().request("/test", {
      method: "GET",
      headers: { "X-App-Id": "app-1" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects malformed API key", async () => {
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        Authorization: "Bearer not-a-real-key",
        "X-App-Id": "app-1",
      },
    });
    expect(res.status).toBe(401);
  });

  it("rejects missing X-App-Id", async () => {
    const res = await createApp().request("/test", {
      method: "GET",
      headers: { Authorization: `Bearer ${validLiveKey()}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects when X-App-Id mismatches API key", async () => {
    mockVerify.mockResolvedValue(validResult());
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${validLiveKey()}`,
        "X-App-Id": "different-app",
        Origin: "https://example.com",
      },
    });
    expect(res.status).toBe(401);
  });

  it("allows request when enforceOrigin passes", async () => {
    mockVerify.mockResolvedValue(validResult());
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${validLiveKey()}`,
        "X-App-Id": "app-1",
        Origin: "https://example.com",
      },
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 with origin_not_allowed when enforceOrigin rejects", async () => {
    mockVerify.mockResolvedValue(validResult());
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${validLiveKey()}`,
        "X-App-Id": "app-1",
        Origin: "https://evil.com",
      },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("origin_not_allowed");
  });

  it("rejects when Origin header is missing (requireOrigin=true)", async () => {
    mockVerify.mockResolvedValue(validResult());
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${validLiveKey()}`,
        "X-App-Id": "app-1",
      },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("origin_not_allowed");
  });

  it("passes keyEnvironment to enforceOrigin for testMode derivation", async () => {
    mockVerify.mockResolvedValue(validResult({ environment: "test" }));
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${validTestKey()}`,
        "X-App-Id": "app-1",
        Origin: "http://localhost:3001",
      },
    });
    expect(res.status).toBe(200);
  });

  it("passes application and apiKey context on success", async () => {
    mockVerify.mockResolvedValue(validResult());
    const res = await createApp().request("/test", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${validLiveKey()}`,
        "X-App-Id": "app-1",
        Origin: "https://example.com",
      },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.auth).toEqual({
      application: {
        id: "app-1",
        domain: "example.com",
        allowedOrigins: ["example.com"],
      },
      apiKey: { id: "key-1", environment: "live" },
    });
    expect(mockTouch).toHaveBeenCalledWith("key-1");
  });
});
