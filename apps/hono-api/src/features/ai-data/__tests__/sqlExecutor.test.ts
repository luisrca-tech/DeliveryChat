import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockClientQuery, mockRelease, mockConnect, mockEnd, PoolCtor } =
  vi.hoisted(() => ({
    mockClientQuery: vi.fn(),
    mockRelease: vi.fn(),
    mockConnect: vi.fn(),
    mockEnd: vi.fn().mockResolvedValue(undefined),
    PoolCtor: vi.fn(),
  }));

vi.mock("pg", () => ({ Pool: PoolCtor }));

function applyPoolImplementation() {
  PoolCtor.mockImplementation(function (this: unknown, config: unknown) {
    return { config, connect: mockConnect, end: mockEnd };
  });
  mockConnect.mockImplementation(async () => ({
    query: mockClientQuery,
    release: mockRelease,
  }));
}

/**
 * The executor runs BEGIN / COMMIT / ROLLBACK plus the data query on the same
 * client. Only the data query is called with a values array (2 args), so this
 * isolates the actual query invocation from the transaction control statements.
 */
function dataQueryCall(): [string, unknown[]] {
  const call = mockClientQuery.mock.calls.find((c) => c.length === 2);
  if (!call) throw new Error("data query was not executed");
  return call as [string, unknown[]];
}

function clientQuerySql(): string[] {
  return mockClientQuery.mock.calls.map((c) => c[0] as string);
}

vi.mock("../../../lib/crypto/secretBox.js", () => ({
  decryptSecret: vi.fn((value: string) => `decrypted:${value}`),
  DecryptionError: class DecryptionError extends Error {},
}));

const { executeSqlTool, __resetPoolsForTest } = await import(
  "../sqlExecutor.js"
);

function input(overrides: {
  applicationId?: string;
  query?: string;
  properties?: Record<
    string,
    { type: "string" | "integer" | "number" | "boolean" }
  >;
  params?: Record<string, unknown>;
}) {
  return {
    applicationId: overrides.applicationId ?? "app-1",
    tool: {
      name: "lookupProduct",
      backingType: "sql" as const,
      inputSchema: {
        properties: overrides.properties ?? {
          sku: { type: "string" as const },
        },
      },
      config: {
        query:
          overrides.query ?? "SELECT id, name FROM products WHERE sku = $1",
      },
    },
    source: {
      kind: "sql" as const,
      config: { encryptedConnectionString: "enc-conn" },
    },
    params: overrides.params ?? { sku: "ABC" },
  };
}

beforeEach(async () => {
  await __resetPoolsForTest();
  PoolCtor.mockReset();
  mockClientQuery.mockReset();
  mockConnect.mockReset();
  mockRelease.mockReset();
  mockEnd.mockReset();
  mockEnd.mockResolvedValue(undefined);
  applyPoolImplementation();
});

describe("executeSqlTool", () => {
  it("runs the stored query with positional binds in schema order", async () => {
    mockClientQuery.mockResolvedValue({ rows: [{ id: 1, name: "Widget" }] });

    const result = await executeSqlTool(
      input({
        query: "SELECT id FROM products WHERE sku = $1 AND qty >= $2",
        properties: {
          sku: { type: "string" },
          minQty: { type: "integer" },
        },
        params: { sku: "ABC", minQty: 2 },
      }),
    );

    expect(result).toEqual({ ok: true, data: [{ id: 1, name: "Widget" }] });
    const [, values] = dataQueryCall();
    expect(values).toEqual(["ABC", 2]);
  });

  it("runs the query inside a read-only transaction and commits", async () => {
    mockClientQuery.mockResolvedValue({ rows: [] });

    await executeSqlTool(
      input({ query: "SELECT id FROM products WHERE sku = $1" }),
    );

    const sqls = clientQuerySql();
    expect(sqls[0]).toBe("BEGIN TRANSACTION READ ONLY");
    expect(sqls[sqls.length - 1]).toBe("COMMIT");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("appends LIMIT 50 when the query has no LIMIT", async () => {
    mockClientQuery.mockResolvedValue({ rows: [] });

    await executeSqlTool(
      input({ query: "SELECT * FROM products WHERE sku = $1" }),
    );

    const [queryText] = dataQueryCall();
    expect(queryText).toMatch(/LIMIT 50$/);
  });

  it("does not append LIMIT when the query already has one", async () => {
    mockClientQuery.mockResolvedValue({ rows: [] });

    const query = "SELECT * FROM products WHERE sku = $1 LIMIT 10";
    await executeSqlTool(input({ query }));

    const [queryText] = dataQueryCall();
    expect(queryText).toBe(query);
  });

  it("reuses one pool per application", async () => {
    mockClientQuery.mockResolvedValue({ rows: [] });

    await executeSqlTool(input({ applicationId: "app-1" }));
    await executeSqlTool(input({ applicationId: "app-1" }));

    expect(PoolCtor).toHaveBeenCalledTimes(1);
  });

  it("creates a separate pool per application", async () => {
    mockClientQuery.mockResolvedValue({ rows: [] });

    await executeSqlTool(input({ applicationId: "app-1" }));
    await executeSqlTool(input({ applicationId: "app-2" }));

    expect(PoolCtor).toHaveBeenCalledTimes(2);
  });

  it("configures the pool with statement_timeout, max and decrypted connection string", async () => {
    mockClientQuery.mockResolvedValue({ rows: [] });

    await executeSqlTool(input({}));

    const config = PoolCtor.mock.calls[0]![0] as Record<string, unknown>;
    expect(config.statement_timeout).toBe(5000);
    expect(config.max).toBe(2);
    expect(config.connectionString).toBe("decrypted:enc-conn");
  });

  it("evicts the oldest pool beyond the pool cap", async () => {
    mockClientQuery.mockResolvedValue({ rows: [] });

    for (let i = 0; i < 21; i++) {
      await executeSqlTool(input({ applicationId: `app-${i}` }));
    }

    expect(PoolCtor).toHaveBeenCalledTimes(21);
    expect(mockEnd).toHaveBeenCalledTimes(1); // oldest pool ended
  });

  it("returns an execution error for a stored non-SELECT query (lint filter)", async () => {
    const result = await executeSqlTool(
      input({ query: "DELETE FROM products WHERE id = $1" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("execution");
    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it("maps a read-only transaction violation to an execution error and rolls back", async () => {
    // Simulates a write that slips past the lint filter (e.g. a mutating
    // function): Postgres rejects it with SQLSTATE 25006 at runtime.
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      const error = new Error(
        "cannot execute UPDATE in a read-only transaction",
      ) as Error & { code?: string };
      error.code = "25006";
      throw error;
    });

    const result = await executeSqlTool(
      input({ query: "SELECT mutating_fn($1)" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("execution");
      // Message must not leak the offending SQL or the driver error text.
      expect(result.error).toBe("Query execution failed");
    }
    expect(clientQuerySql()).toContain("ROLLBACK");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("returns kind 'timeout' when the statement times out", async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      throw new Error("canceling statement due to statement timeout");
    });

    const result = await executeSqlTool(input({}));

    expect(result).toEqual({
      ok: false,
      kind: "timeout",
      error: expect.any(String),
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("returns an execution error when the result exceeds the size cap", async () => {
    const bigRows = Array.from({ length: 5000 }, (_, i) => ({
      id: i,
      blob: "x".repeat(100),
    }));
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      return { rows: bigRows };
    });

    const result = await executeSqlTool(input({}));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("execution");
      expect(result.error).toMatch(/too large/);
    }
  });

  it("returns an execution error when the query fails", async () => {
    mockClientQuery.mockImplementation(async (sql: string) => {
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [] };
      throw new Error("relation does not exist");
    });

    const result = await executeSqlTool(input({}));

    expect(result).toEqual({
      ok: false,
      kind: "execution",
      error: expect.any(String),
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});
