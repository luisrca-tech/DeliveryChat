import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
  },
}));

const { db } = await import("../../../db/index.js");
const { resolveAndEnforceOrigin } = await import("../resolveApplication.js");

const mockSelect = db.select as unknown as ReturnType<typeof vi.fn>;

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

function appRow(overrides: Partial<{
  id: string;
  domain: string;
  allowedOrigins: string[];
  organizationId: string;
}> = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    domain: "example.com",
    allowedOrigins: ["example.com"],
    organizationId: "org-1",
    ...overrides,
  };
}

describe("resolveAndEnforceOrigin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns app_not_found when application does not exist", async () => {
    mockSelect.mockReturnValue(chainMock([]));

    const result = await resolveAndEnforceOrigin("00000000-0000-0000-0000-000000000001", "https://example.com");

    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    expect(result.error).toBe("app_not_found");
    expect(result.status).toBe(404);
  });

  it("returns app_not_found for invalid UUID without querying DB", async () => {
    const result = await resolveAndEnforceOrigin("bad-id", "https://example.com");

    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    expect(result.error).toBe("app_not_found");
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns origin_not_allowed when origin is rejected", async () => {
    mockSelect.mockReturnValue(chainMock([appRow()]));

    const result = await resolveAndEnforceOrigin(
      "00000000-0000-0000-0000-000000000001",
      "https://evil.com",
    );

    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    expect(result.error).toBe("origin_not_allowed");
    expect(result.status).toBe(403);
  });

  it("returns authorized with application when origin is allowed", async () => {
    const app = appRow();
    mockSelect.mockReturnValue(chainMock([app]));

    const result = await resolveAndEnforceOrigin(
      "00000000-0000-0000-0000-000000000001",
      "https://example.com",
    );

    expect(result.authorized).toBe(true);
    if (!result.authorized) return;
    expect(result.application).toEqual(app);
  });

  it("allows request when origin is absent and requireOrigin is false", async () => {
    mockSelect.mockReturnValue(chainMock([appRow()]));

    const result = await resolveAndEnforceOrigin(
      "00000000-0000-0000-0000-000000000001",
      undefined,
    );

    expect(result.authorized).toBe(true);
  });

  it("rejects when origin is absent and requireOrigin is true", async () => {
    mockSelect.mockReturnValue(chainMock([appRow()]));

    const result = await resolveAndEnforceOrigin(
      "00000000-0000-0000-0000-000000000001",
      undefined,
      { requireOrigin: true },
    );

    expect(result.authorized).toBe(false);
    if (result.authorized) return;
    expect(result.error).toBe("origin_not_allowed");
  });

  it("passes keyEnvironment to origin enforcement", async () => {
    mockSelect.mockReturnValue(chainMock([appRow()]));

    const result = await resolveAndEnforceOrigin(
      "00000000-0000-0000-0000-000000000001",
      "http://localhost:3001",
      { keyEnvironment: "test" },
    );

    expect(result.authorized).toBe(true);
  });

  it("rejects localhost on live keyEnvironment", async () => {
    mockSelect.mockReturnValue(chainMock([appRow()]));

    const result = await resolveAndEnforceOrigin(
      "00000000-0000-0000-0000-000000000001",
      "http://localhost:3001",
      { keyEnvironment: "live" },
    );

    expect(result.authorized).toBe(false);
  });
});
