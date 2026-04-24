import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchSettings, fetchWsToken } from "./api.js";

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
      "https://api.example.com/v1/widget/settings/app-123",
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
      "https://api.example.com/v1/widget/settings/app-123",
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
      "https://api.example.com/v1/widget/ws-token",
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
      "https://api.example.com/v1/widget/ws-token",
      expect.any(Object),
    );
  });
});
