import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchSettings, fetchWsToken, postIdentify } from "./api.js";
import type { IdentifyPayload } from "./api.js";

describe("fetchSettings", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns null when response is not ok", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: false } as Response);

    const result = await fetchSettings("https://api.example.com", "app-123");

    expect(result).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/widget/settings/app-123",
    );
  });

  it("returns settings when response is ok", async () => {
    const settings = { colors: { primary: "#ff0000" } };
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ settings }),
    } as Response);

    const result = await fetchSettings("https://api.example.com", "app-123");

    expect(result).toEqual(settings);
  });

  it("strips trailing slash from apiBaseUrl", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: false } as Response);

    await fetchSettings("https://api.example.com/", "app-123");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/widget/settings/app-123",
    );
  });
});

describe("fetchWsToken", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns a token on success", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: "signed-token-123" }),
    } as Response);

    const token = await fetchWsToken("https://api.example.com", "app-1", "visitor-1");

    expect(token).toBe("signed-token-123");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/widget/ws-token",
      {
        method: "POST",
        headers: {
          "X-App-Id": "app-1",
          "X-Visitor-Id": "visitor-1",
        },
      },
    );
  });

  it("throws on non-ok response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    await expect(
      fetchWsToken("https://api.example.com", "app-1", "visitor-1"),
    ).rejects.toThrow("Failed to fetch WS token (401)");
  });

  it("strips trailing slash from apiBaseUrl", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: "t" }),
    } as Response);

    await fetchWsToken("https://api.example.com/", "app-1", "visitor-1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/widget/ws-token",
      expect.any(Object),
    );
  });
});

describe("postIdentify", () => {
  const originalFetch = globalThis.fetch;
  const baseUrl = "https://api.example.com";
  const appId = "app-1";
  const visitorId = "visitor-1";
  const payload: IdentifyPayload = {
    name: "Jane Doe",
    email: "jane@example.com",
    externalId: "user-123",
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns identity record on success", async () => {
    const identity = {
      id: "id-1",
      anonymousUserId: visitorId,
      organizationId: "org-1",
      externalId: "user-123",
      email: "jane@example.com",
      name: "Jane Doe",
      metadata: null,
      hmacVerified: false,
    };
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ identity }),
    } as Response);

    const result = await postIdentify(baseUrl, appId, visitorId, payload);

    expect(result).toEqual(identity);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/widget/identify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-App-Id": appId,
          "X-Visitor-Id": visitorId,
        },
        body: JSON.stringify(payload),
      },
    );
  });

  it("throws with status and message on non-ok response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      json: () => Promise.resolve({ message: "externalId is required for HMAC" }),
    } as unknown as Response);

    await expect(
      postIdentify(baseUrl, appId, visitorId, payload),
    ).rejects.toThrow("identify failed (422): externalId is required for HMAC");
  });

  it("falls back to statusText when error body has no message", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({}),
    } as unknown as Response);

    await expect(
      postIdentify(baseUrl, appId, visitorId, payload),
    ).rejects.toThrow("identify failed (500): Internal Server Error");
  });

  it("handles unparseable error body gracefully", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
      json: () => Promise.reject(new Error("invalid json")),
    } as unknown as Response);

    await expect(
      postIdentify(baseUrl, appId, visitorId, payload),
    ).rejects.toThrow("identify failed (502): Bad Gateway");
  });

  it("strips trailing slash from apiBaseUrl", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ identity: { id: "id-1" } }),
    } as Response);

    await postIdentify("https://api.example.com/", appId, visitorId, payload);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/widget/identify",
      expect.any(Object),
    );
  });
});
