import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../httpExecutor.js", () => ({
  executeHttpTool: vi
    .fn()
    .mockResolvedValue({ ok: true, data: { http: true } }),
}));

vi.mock("../sqlExecutor.js", () => ({
  executeSqlTool: vi.fn().mockResolvedValue({ ok: true, data: { sql: true } }),
}));

const { executeHttpTool } = await import("../httpExecutor.js");
const { executeSqlTool } = await import("../sqlExecutor.js");
const { executeDataTool } = await import("../index.js");

const mockHttp = executeHttpTool as unknown as ReturnType<typeof vi.fn>;
const mockSql = executeSqlTool as unknown as ReturnType<typeof vi.fn>;

function makeInput(
  backingType: "http" | "sql",
  params: Record<string, unknown>,
) {
  return {
    applicationId: "app-1",
    tool: {
      name: "tool",
      backingType,
      inputSchema: {
        properties: { sku: { type: "string" as const } },
        required: ["sku"],
      },
      config:
        backingType === "http"
          ? ({ method: "GET" as const, urlTemplate: "/x/{sku}" } as const)
          : ({ query: "SELECT 1" } as const),
    },
    source: {
      kind: backingType,
      config:
        backingType === "http"
          ? { baseUrl: "https://a.com", allowedHost: "a.com" }
          : { encryptedConnectionString: "enc" },
    },
    params,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("executeDataTool", () => {
  it("returns a validation error (kind 'validation') without dispatching", async () => {
    const result = await executeDataTool(makeInput("http", {}));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("validation");
    expect(mockHttp).not.toHaveBeenCalled();
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("dispatches valid params to the HTTP executor", async () => {
    const result = await executeDataTool(makeInput("http", { sku: "ABC" }));

    expect(result).toEqual({ ok: true, data: { http: true } });
    expect(mockHttp).toHaveBeenCalledOnce();
  });

  it("dispatches valid params to the SQL executor", async () => {
    const result = await executeDataTool(makeInput("sql", { sku: "ABC" }));

    expect(result).toEqual({ ok: true, data: { sql: true } });
    expect(mockSql).toHaveBeenCalledOnce();
  });
});
