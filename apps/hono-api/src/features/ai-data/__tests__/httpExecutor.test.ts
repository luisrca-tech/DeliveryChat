import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

vi.mock("../../../lib/crypto/secretBox.js", () => ({
  decryptSecret: vi.fn((value: string) => `decrypted:${value}`),
  DecryptionError: class DecryptionError extends Error {},
}));

const { lookup } = await import("node:dns/promises");
const { decryptSecret } = await import("../../../lib/crypto/secretBox.js");
const { executeHttpTool } = await import("../httpExecutor.js");

const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>;
const mockDecrypt = decryptSecret as unknown as ReturnType<typeof vi.fn>;

const PUBLIC_ADDR = [{ address: "93.184.216.34", family: 4 }];

function baseInput(overrides: {
  urlTemplate?: string;
  params?: Record<string, unknown>;
  encryptedHeaders?: Record<string, string>;
}) {
  return {
    tool: {
      name: "checkAvailability",
      backingType: "http" as const,
      inputSchema: { properties: { sku: { type: "string" as const } } },
      config: {
        method: "GET" as const,
        urlTemplate: overrides.urlTemplate ?? "/products/{sku}",
      },
    },
    source: {
      kind: "http" as const,
      config: {
        baseUrl: "https://api.example.com",
        allowedHost: "api.example.com",
        encryptedHeaders: overrides.encryptedHeaders,
      },
    },
    params: overrides.params ?? { sku: "ABC-1" },
  };
}

function jsonResponse(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLookup.mockResolvedValue(PUBLIC_ADDR);
  mockDecrypt.mockImplementation((value: string) => `decrypted:${value}`);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("executeHttpTool", () => {
  it("returns parsed JSON on the happy path and URL-encodes params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ inStock: 5 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeHttpTool(
      baseInput({ params: { sku: "A B/C" } }),
    );

    expect(result).toEqual({ ok: true, data: { inStock: 5 } });
    const calledUrl = fetchMock.mock.calls[0]![0] as URL;
    expect(calledUrl.toString()).toBe(
      "https://api.example.com/products/A%20B%2FC",
    );
    const options = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(options.method).toBe("GET");
    expect(options.redirect).toBe("manual");
  });

  it("rejects when the resolved host does not match allowedHost", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const input = baseInput({});
    input.source.config.allowedHost = "other.example.com";

    const result = await executeHttpTool(input);

    expect(result).toEqual({
      ok: false,
      kind: "execution",
      error: expect.stringContaining("allowed host"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when DNS resolves to a private address", async () => {
    mockLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeHttpTool(baseInput({}));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("execution");
      expect(result.error).toMatch(/private or reserved/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects redirect responses (manual redirect)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeHttpTool(baseInput({}));

    expect(result).toEqual({
      ok: false,
      kind: "execution",
      error: expect.stringContaining("Redirect"),
    });
  });

  it("returns kind 'timeout' when the request times out", async () => {
    const timeoutError = new Error("timed out");
    timeoutError.name = "TimeoutError";
    const fetchMock = vi.fn().mockRejectedValue(timeoutError);
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeHttpTool(baseInput({}));

    expect(result).toEqual({
      ok: false,
      kind: "timeout",
      error: expect.any(String),
    });
  });

  it("rejects an oversize response via content-length", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { big: true },
        { headers: { "content-length": String(300 * 1024) } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeHttpTool(baseInput({}));

    expect(result).toEqual({
      ok: false,
      kind: "execution",
      error: expect.stringContaining("too large"),
    });
  });

  it("rejects a non-JSON response body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeHttpTool(baseInput({}));

    expect(result).toEqual({
      ok: false,
      kind: "execution",
      error: expect.stringContaining("JSON"),
    });
  });

  it("rejects unresolved URL template placeholders", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeHttpTool(
      baseInput({ urlTemplate: "/products/{sku}/{missing}", params: { sku: "X" } }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/unresolved/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("decrypts configured headers and sends them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await executeHttpTool(
      baseInput({ encryptedHeaders: { Authorization: "enc-token" } }),
    );

    expect(mockDecrypt).toHaveBeenCalledWith("enc-token");
    const options = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers.Authorization).toBe("decrypted:enc-token");
  });
});
