import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { escalateConversation } from "./conversation.js";

describe("escalateConversation", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("posts to the escalate endpoint with visitor auth headers", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true } as Response);

    await escalateConversation(
      "https://api.example.com",
      "app-1",
      "visitor-1",
      "conv-1",
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/widget/conversations/conv-1/escalate",
      {
        method: "POST",
        headers: {
          "X-App-Id": "app-1",
          "X-Visitor-Id": "visitor-1",
          "Content-Type": "application/json",
        },
      },
    );
  });

  it("throws with status on non-ok response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 409,
    } as Response);

    await expect(
      escalateConversation(
        "https://api.example.com",
        "app-1",
        "visitor-1",
        "conv-1",
      ),
    ).rejects.toThrow("Failed to escalate conversation (409)");
  });

  it("resolves without throwing on a successful idempotent no-op", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true } as Response);

    await expect(
      escalateConversation(
        "https://api.example.com",
        "app-1",
        "visitor-1",
        "conv-1",
      ),
    ).resolves.toBeUndefined();
  });
});
