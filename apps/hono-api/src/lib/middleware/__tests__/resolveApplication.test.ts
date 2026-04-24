import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
  },
}));

const { db } = await import("../../../db/index.js");
const { resolveApplicationById, isValidUuid } = await import(
  "../resolveApplication.js"
);

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

describe("isValidUuid", () => {
  it("accepts a valid UUID", () => {
    expect(isValidUuid("00000000-0000-0000-0000-000000000001")).toBe(true);
  });

  it("rejects non-UUID strings", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(isValidUuid("")).toBe(false);
  });
});

describe("resolveApplicationById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for invalid UUID", async () => {
    const result = await resolveApplicationById("bad-id");
    expect(result).toBeNull();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns null when application not found", async () => {
    mockSelect.mockReturnValue(chainMock([]));
    const result = await resolveApplicationById(
      "00000000-0000-0000-0000-000000000001",
    );
    expect(result).toBeNull();
  });

  it("returns application when found", async () => {
    const app = {
      id: "00000000-0000-0000-0000-000000000001",
      domain: "example.com",
      allowedOrigins: ["example.com"],
      organizationId: "org-1",
    };
    mockSelect.mockReturnValue(chainMock([app]));
    const result = await resolveApplicationById(app.id);
    expect(result).toEqual(app);
  });
});
