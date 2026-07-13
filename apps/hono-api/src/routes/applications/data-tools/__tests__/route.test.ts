import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const APP_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_APP_ID = "22222222-2222-2222-2222-222222222222";
const ORG_ID = "org-1";
const USER_ID = "user-1";
const TOOL_ID = "tool-aaaa";

vi.mock("../../../../env.js", () => ({
  env: {
    SECRETS_ENCRYPTION_KEY: "test",
    GROQ_API_KEY: "test-key",
    AI_INTERVIEW_MODEL: "mock://interview",
  },
}));

// --- Secret box: deterministic, reversible-looking prefix so tests can assert
// that NO plaintext (and no encrypted blob) ever leaves an endpoint. ---
vi.mock("../../../../lib/crypto/secretBox.js", () => ({
  encryptSecret: (plaintext: string) => `enc:${plaintext}`,
  decryptSecret: (ciphertext: string) => ciphertext.replace(/^enc:/, ""),
}));

// --- ai-data: keep validateSqlQuery real (pure), mock executeDataTool. ---
const mockExecuteDataTool = vi.fn();
vi.mock("../../../../features/ai-data/index.js", async (importActual) => {
  const actual = await importActual<
    typeof import("../../../../features/ai-data/index.js")
  >();
  return {
    ...actual,
    executeDataTool: (...args: unknown[]) => mockExecuteDataTool(...args),
  };
});

// --- In-memory data-access store shared with the route via the mock below. ---
type SourceRow = {
  id: string;
  applicationId: string;
  kind: "http" | "sql";
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};
type ToolRow = {
  id: string;
  applicationId: string;
  name: string;
  description: string;
  inputSchema: unknown;
  backingType: "http" | "sql";
  config: Record<string, unknown>;
  enabled: boolean;
  lastTestedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const sourceStore = new Map<string, SourceRow>();
const toolStore = new Map<string, ToolRow>();
const NOW = "2026-07-11T00:00:00.000Z";

vi.mock("../dataAccess.js", () => ({
  findOwnedApplication: async (applicationId: string, organizationId: string) =>
    applicationId !== OTHER_APP_ID && organizationId === ORG_ID
      ? { id: applicationId }
      : null,
  getDataSource: async (applicationId: string) =>
    sourceStore.get(applicationId) ?? null,
  upsertDataSource: async (input: {
    applicationId: string;
    kind: "http" | "sql";
    config: Record<string, unknown>;
  }) => {
    const existing = sourceStore.get(input.applicationId);
    const row: SourceRow = {
      id: existing?.id ?? "src-1",
      applicationId: input.applicationId,
      kind: input.kind,
      config: input.config,
      enabled: true,
      createdAt: existing?.createdAt ?? NOW,
      updatedAt: NOW,
    };
    sourceStore.set(input.applicationId, row);
    return row;
  },
  listDataTools: async (applicationId: string) =>
    [...toolStore.values()].filter((t) => t.applicationId === applicationId),
  getDataTool: async (toolId: string, applicationId: string) => {
    const row = toolStore.get(toolId);
    return row && row.applicationId === applicationId ? row : null;
  },
  createDataTool: async (input: Omit<ToolRow, "id" | "enabled" | "lastTestedAt" | "createdAt" | "updatedAt">) => {
    const row: ToolRow = {
      ...input,
      id: TOOL_ID,
      enabled: false,
      lastTestedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    toolStore.set(row.id, row);
    return row;
  },
  updateDataTool: async (input: {
    toolId: string;
    applicationId: string;
    name: string;
    description: string;
    inputSchema: unknown;
    backingType: "http" | "sql";
    config: Record<string, unknown>;
  }) => {
    const row = toolStore.get(input.toolId);
    if (!row || row.applicationId !== input.applicationId) return null;
    const updated: ToolRow = {
      ...row,
      name: input.name,
      description: input.description,
      inputSchema: input.inputSchema,
      backingType: input.backingType,
      config: input.config,
      enabled: false,
      lastTestedAt: null,
      updatedAt: NOW,
    };
    toolStore.set(row.id, updated);
    return updated;
  },
  deleteDataTool: async (toolId: string, applicationId: string) => {
    const row = toolStore.get(toolId);
    if (!row || row.applicationId !== applicationId) return false;
    toolStore.delete(toolId);
    return true;
  },
  markToolTested: async (toolId: string, applicationId: string) => {
    const row = toolStore.get(toolId);
    if (!row || row.applicationId !== applicationId) return null;
    const updated = { ...row, lastTestedAt: NOW };
    toolStore.set(toolId, updated);
    return updated;
  },
  setToolEnabled: async (toolId: string, applicationId: string, enabled: boolean) => {
    const row = toolStore.get(toolId);
    if (!row || row.applicationId !== applicationId) return null;
    const updated = { ...row, enabled };
    toolStore.set(toolId, updated);
    return updated;
  },
}));

// --- Middleware mocks (mirror the ai-interview sibling test). ---
let mockAuthContext:
  | null
  | {
      user: { id: string; name: string };
      organization: { id: string; plan: string; name: string };
      membership: { id: string; role: string; userId: string; organizationId: string };
    } = null;

vi.mock("../../../../lib/middleware/auth.js", () => ({
  requireTenantAuth:
    () =>
    async (
      c: { set: (k: string, v: unknown) => void },
      next: () => Promise<void>,
    ) => {
      if (!mockAuthContext) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
        });
      }
      c.set("auth", mockAuthContext);
      await next();
    },
  getTenantAuth: (c: { get: (k: string) => unknown }) => c.get("auth"),
  requireRole:
    (minRole: "operator" | "admin" | "super_admin") =>
    async (c: { get: (k: string) => unknown }, next: () => Promise<void>) => {
      const auth = c.get("auth") as { membership: { role: string } } | null;
      const rank: Record<string, number> = { operator: 1, admin: 2, super_admin: 3 };
      const current = rank[auth?.membership.role ?? ""] ?? 0;
      if (current < (rank[minRole] ?? 0)) {
        return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
      }
      await next();
    },
}));

// Pass-through mock for the AI add-on gate — its plan/add-on matrix is covered
// by the ai.middleware gate tests (ai.addonGates.test.ts).
vi.mock("../../../../features/ai/ai.middleware.js", () => ({
  requireAiAddon: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

let billingAllowed = true;
vi.mock("../../../../lib/middleware/billing.js", () => ({
  checkBillingStatus: () => async (_c: unknown, next: () => Promise<void>) => {
    if (!billingAllowed) {
      return new Response(JSON.stringify({ error: "billing" }), { status: 402 });
    }
    await next();
  },
}));

const { dataToolsRoute } = await import("../index.js");

function adminAuth() {
  return {
    user: { id: USER_ID, name: "Admin" },
    organization: { id: ORG_ID, plan: "ENTERPRISE", name: "Test Org" },
    membership: { id: "m-1", role: "admin", userId: USER_ID, organizationId: ORG_ID },
  };
}
function operatorAuth() {
  return {
    ...adminAuth(),
    membership: { id: "m-1", role: "operator", userId: USER_ID, organizationId: ORG_ID },
  };
}
function buildApp() {
  return new Hono().route("/applications", dataToolsRoute);
}

function seedSqlSource() {
  sourceStore.set(APP_ID, {
    id: "src-1",
    applicationId: APP_ID,
    kind: "sql",
    config: { encryptedConnectionString: "enc:postgres://u:p@host/db" },
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
}
function seedHttpSource() {
  sourceStore.set(APP_ID, {
    id: "src-1",
    applicationId: APP_ID,
    kind: "http",
    config: { baseUrl: "https://api.example.com", allowedHost: "api.example.com" },
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
}
function seedTool(overrides: Partial<ToolRow> = {}) {
  toolStore.set(TOOL_ID, {
    id: TOOL_ID,
    applicationId: APP_ID,
    name: "checkStock",
    description: "Look up live stock for a product SKU.",
    inputSchema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] },
    backingType: "sql",
    config: { query: "SELECT qty FROM stock WHERE sku = $1" },
    enabled: false,
    lastTestedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

function req(path: string, method = "GET", body?: unknown) {
  return buildApp().request(`/applications${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthContext = adminAuth();
  billingAllowed = true;
  sourceStore.clear();
  toolStore.clear();
});

describe("GET /:applicationId/data-source", () => {
  it("returns 401 unauthenticated", async () => {
    mockAuthContext = null;
    expect((await req(`/${APP_ID}/data-source`)).status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    mockAuthContext = operatorAuth();
    expect((await req(`/${APP_ID}/data-source`)).status).toBe(403);
  });

  it("returns 404 for cross-tenant application", async () => {
    expect((await req(`/${OTHER_APP_ID}/data-source`)).status).toBe(404);
  });

  it("returns null when no source configured", async () => {
    const res = await req(`/${APP_ID}/data-source`);
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("redacts sql secrets (no connectionString in response)", async () => {
    seedSqlSource();
    const res = await req(`/${APP_ID}/data-source`);
    const body = await res.json();
    expect(body).toMatchObject({ kind: "sql", enabled: true, hasConnectionString: true });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("postgres://");
    expect(raw).not.toContain("enc:");
  });
});

describe("PUT /:applicationId/data-source — secrets never returned", () => {
  it("upserts a sql source and never leaks the connection string", async () => {
    const connectionString = "postgres://user:pass@db.internal/app";
    const putRes = await req(`/${APP_ID}/data-source`, "PUT", {
      kind: "sql",
      connectionString,
    });
    expect(putRes.status).toBe(200);
    const putBody = await putRes.json();
    expect(putBody).toMatchObject({ kind: "sql", enabled: true, hasConnectionString: true });

    // Stored value is encrypted, not plaintext.
    expect(sourceStore.get(APP_ID)?.config).toEqual({
      encryptedConnectionString: `enc:${connectionString}`,
    });

    // Neither the PUT nor a follow-up GET exposes the secret.
    const putRaw = JSON.stringify(putBody);
    expect(putRaw).not.toContain(connectionString);
    expect(putRaw).not.toContain("enc:");

    const getRaw = JSON.stringify(await (await req(`/${APP_ID}/data-source`)).json());
    expect(getRaw).not.toContain(connectionString);
    expect(getRaw).not.toContain("pass");
  });

  it("encrypts http header values and returns only header names", async () => {
    const res = await req(`/${APP_ID}/data-source`, "PUT", {
      kind: "http",
      baseUrl: "https://api.example.com",
      allowedHost: "api.example.com",
      headers: { Authorization: "Bearer super-secret-token" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      kind: "http",
      hasHeaders: true,
      headerNames: ["Authorization"],
      baseUrl: "https://api.example.com",
    });
    expect(JSON.stringify(body)).not.toContain("super-secret-token");
    expect(sourceStore.get(APP_ID)?.config).toMatchObject({
      encryptedHeaders: { Authorization: "enc:Bearer super-secret-token" },
    });
  });

  it("rejects when allowedHost does not match baseUrl host (400)", async () => {
    const res = await req(`/${APP_ID}/data-source`, "PUT", {
      kind: "http",
      baseUrl: "https://api.example.com",
      allowedHost: "evil.com",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a first-time sql source without connectionString (400)", async () => {
    const res = await req(`/${APP_ID}/data-source`, "PUT", { kind: "sql" });
    expect(res.status).toBe(400);
  });

  it("preserves existing encrypted connection string when omitted (write-only)", async () => {
    seedSqlSource();
    const res = await req(`/${APP_ID}/data-source`, "PUT", { kind: "sql" });
    expect(res.status).toBe(200);
    expect(sourceStore.get(APP_ID)?.config).toEqual({
      encryptedConnectionString: "enc:postgres://u:p@host/db",
    });
  });

  it("returns 402 when billing blocks the write", async () => {
    billingAllowed = false;
    const res = await req(`/${APP_ID}/data-source`, "PUT", {
      kind: "sql",
      connectionString: "postgres://x",
    });
    expect(res.status).toBe(402);
  });
});

describe("POST /:applicationId/data-tools — create", () => {
  it("creates an sql tool disabled by default", async () => {
    seedSqlSource();
    const res = await req(`/${APP_ID}/data-tools`, "POST", {
      name: "checkStock",
      description: "Look up live stock for a SKU.",
      inputSchema: { properties: { sku: { type: "string" } }, required: ["sku"] },
      backingType: "sql",
      config: { query: "SELECT qty FROM stock WHERE sku = $1" },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.lastTestedAt).toBeNull();
    expect(body.name).toBe("checkStock");
  });

  it("rejects an invalid tool name (regex) with 400", async () => {
    seedSqlSource();
    const res = await req(`/${APP_ID}/data-tools`, "POST", {
      name: "1-bad name",
      description: "A description long enough.",
      inputSchema: { properties: {} },
      backingType: "sql",
      config: { query: "SELECT 1" },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a too-short description with 400", async () => {
    seedSqlSource();
    const res = await req(`/${APP_ID}/data-tools`, "POST", {
      name: "shortDesc",
      description: "short",
      inputSchema: { properties: {} },
      backingType: "sql",
      config: { query: "SELECT 1" },
    });
    expect(res.status).toBe(400);
  });

  it("rejects an http urlTemplate containing whitespace with 400", async () => {
    seedHttpSource();
    const res = await req(`/${APP_ID}/data-tools`, "POST", {
      name: "searchProducts",
      description: "Searches the product catalog.",
      inputSchema: { properties: { category: { type: "string" } } },
      backingType: "http",
      config: { method: "GET", urlTemplate: "/products?category={category}\n&sort=asc" },
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid sql query at save time (400)", async () => {
    seedSqlSource();
    const res = await req(`/${APP_ID}/data-tools`, "POST", {
      name: "dropStuff",
      description: "This should be rejected.",
      inputSchema: { properties: {} },
      backingType: "sql",
      config: { query: "DELETE FROM stock" },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_error");
  });

  it("rejects a nested (non-flat) inputSchema with 400", async () => {
    seedSqlSource();
    const res = await req(`/${APP_ID}/data-tools`, "POST", {
      name: "nested",
      description: "Nested schema should fail.",
      inputSchema: { properties: { obj: { type: "object" } } },
      backingType: "sql",
      config: { query: "SELECT 1" },
    });
    expect(res.status).toBe(400);
  });

  it("rejects a tool whose backingType mismatches the source kind (400)", async () => {
    seedSqlSource();
    const res = await req(`/${APP_ID}/data-tools`, "POST", {
      name: "httpTool",
      description: "Http tool on a sql source.",
      inputSchema: { properties: {} },
      backingType: "http",
      config: { method: "GET", urlTemplate: "/items" },
    });
    expect(res.status).toBe(400);
  });

  it("rejects tool creation when no source is configured (400)", async () => {
    const res = await req(`/${APP_ID}/data-tools`, "POST", {
      name: "noSource",
      description: "No source configured.",
      inputSchema: { properties: {} },
      backingType: "sql",
      config: { query: "SELECT 1" },
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /:applicationId/data-tools — list", () => {
  it("lists tools for the application", async () => {
    seedSqlSource();
    seedTool();
    const res = await req(`/${APP_ID}/data-tools`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("checkStock");
  });
});

describe("PUT /:applicationId/data-tools/:toolId — resets enabled + lastTestedAt", () => {
  it("a config change resets an enabled, tested tool to disabled/untested", async () => {
    seedSqlSource();
    seedTool({ enabled: true, lastTestedAt: NOW });
    const res = await req(`/${APP_ID}/data-tools/${TOOL_ID}`, "PUT", {
      name: "checkStock",
      description: "Updated description here.",
      inputSchema: { properties: { sku: { type: "string" } }, required: ["sku"] },
      backingType: "sql",
      config: { query: "SELECT qty, name FROM stock WHERE sku = $1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.enabled).toBe(false);
    expect(body.lastTestedAt).toBeNull();
  });

  it("returns 404 updating a missing tool", async () => {
    seedSqlSource();
    const res = await req(`/${APP_ID}/data-tools/missing`, "PUT", {
      name: "x",
      description: "Long enough description.",
      inputSchema: { properties: {} },
      backingType: "sql",
      config: { query: "SELECT 1" },
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /:applicationId/data-tools/:toolId", () => {
  it("hard-deletes an existing tool", async () => {
    seedSqlSource();
    seedTool();
    const res = await req(`/${APP_ID}/data-tools/${TOOL_ID}`, "DELETE");
    expect(res.status).toBe(200);
    expect(toolStore.has(TOOL_ID)).toBe(false);
  });

  it("returns 404 for a missing tool", async () => {
    const res = await req(`/${APP_ID}/data-tools/missing`, "DELETE");
    expect(res.status).toBe(404);
  });
});

describe("POST /:applicationId/data-tools/:toolId/test", () => {
  it("returns 200 with truncated data and marks tested on success", async () => {
    seedSqlSource();
    seedTool();
    mockExecuteDataTool.mockResolvedValue({ ok: true, data: [{ qty: 5 }] });
    const res = await req(`/${APP_ID}/data-tools/${TOOL_ID}/test`, "POST", {
      params: { sku: "ABC" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: [{ qty: 5 }], truncated: false });
    expect(toolStore.get(TOOL_ID)?.lastTestedAt).toBe(NOW);
  });

  it("returns 200 with failure body and does NOT mark tested on failure", async () => {
    seedSqlSource();
    seedTool();
    mockExecuteDataTool.mockResolvedValue({
      ok: false,
      error: "boom",
      kind: "execution",
    });
    const res = await req(`/${APP_ID}/data-tools/${TOOL_ID}/test`, "POST", {
      params: {},
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "boom", kind: "execution" });
    expect(toolStore.get(TOOL_ID)?.lastTestedAt).toBeNull();
  });

  it("truncates large data payloads", async () => {
    seedSqlSource();
    seedTool();
    mockExecuteDataTool.mockResolvedValue({ ok: true, data: "x".repeat(20000) });
    const res = await req(`/${APP_ID}/data-tools/${TOOL_ID}/test`, "POST", {
      params: {},
    });
    const body = await res.json();
    expect(body.truncated).toBe(true);
    expect(typeof body.dataPreview).toBe("string");
    expect(body.dataPreview.length).toBeLessThanOrEqual(10 * 1024);
  });

  it("returns 400 when no data source is configured", async () => {
    seedTool();
    const res = await req(`/${APP_ID}/data-tools/${TOOL_ID}/test`, "POST", {
      params: {},
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /:applicationId/data-tools/:toolId/enable — test gates enable", () => {
  it("rejects enabling an untested tool with 400", async () => {
    seedSqlSource();
    seedTool({ lastTestedAt: null });
    const res = await req(`/${APP_ID}/data-tools/${TOOL_ID}/enable`, "POST", {
      enabled: true,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("test request before enabling");
  });

  it("test-then-enable flow succeeds", async () => {
    seedSqlSource();
    seedTool({ lastTestedAt: null });
    // enabling first fails
    expect(
      (await req(`/${APP_ID}/data-tools/${TOOL_ID}/enable`, "POST", { enabled: true }))
        .status,
    ).toBe(400);
    // run a successful test
    mockExecuteDataTool.mockResolvedValue({ ok: true, data: [] });
    await req(`/${APP_ID}/data-tools/${TOOL_ID}/test`, "POST", { params: { sku: "A" } });
    // now enabling succeeds
    const res = await req(`/${APP_ID}/data-tools/${TOOL_ID}/enable`, "POST", {
      enabled: true,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).enabled).toBe(true);
  });

  it("disabling is always allowed even without a prior test", async () => {
    seedSqlSource();
    seedTool({ enabled: true, lastTestedAt: null });
    const res = await req(`/${APP_ID}/data-tools/${TOOL_ID}/enable`, "POST", {
      enabled: false,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).enabled).toBe(false);
  });
});

describe("tenant isolation", () => {
  it("blocks every endpoint for an application of another org (404)", async () => {
    expect((await req(`/${OTHER_APP_ID}/data-source`)).status).toBe(404);
    expect((await req(`/${OTHER_APP_ID}/data-tools`)).status).toBe(404);
    expect(
      (await req(`/${OTHER_APP_ID}/data-tools`, "POST", {
        name: "x",
        description: "Long enough description.",
        inputSchema: { properties: {} },
        backingType: "sql",
        config: { query: "SELECT 1" },
      })).status,
    ).toBe(404);
    expect(
      (await req(`/${OTHER_APP_ID}/data-tools/${TOOL_ID}/enable`, "POST", {
        enabled: false,
      })).status,
    ).toBe(404);
  });
});
