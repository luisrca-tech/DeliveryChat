import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchSettings } from "./api.js";

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
