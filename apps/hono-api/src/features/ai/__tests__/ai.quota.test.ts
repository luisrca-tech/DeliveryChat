import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db/index.js", () => ({
  db: {
    select: vi.fn(),
  },
}));

const { db } = await import("../../../db/index.js");
const mockSelect = db.select as ReturnType<typeof vi.fn>;

function chainMock(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["from", "where", "limit"];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

const { checkAiQuota } = await import("../ai.quota.js");

describe("checkAiQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns not allowed when plan does not include AI", async () => {
    const result = await checkAiQuota("org-1", "FREE");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("ai_feature_not_available");
    }
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("returns allowed when usage is under the monthly cap", async () => {
    mockSelect
      .mockReturnValueOnce(chainMock([]))
      .mockReturnValueOnce(chainMock([{ count: 100 }]));

    const result = await checkAiQuota("org-1", "PREMIUM");
    expect(result.allowed).toBe(true);
  });

  it("returns not allowed when monthly cap is exceeded", async () => {
    mockSelect
      .mockReturnValueOnce(chainMock([]))
      .mockReturnValueOnce(chainMock([{ count: 3000 }]));

    const result = await checkAiQuota("org-1", "PREMIUM");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("ai_monthly_cap_exceeded");
    }
  });

  it("uses tenant override cap when present", async () => {
    mockSelect
      .mockReturnValueOnce(chainMock([{ aiMonthlyCapOverride: 5000 }]))
      .mockReturnValueOnce(chainMock([{ count: 4999 }]));

    const result = await checkAiQuota("org-1", "ENTERPRISE");
    expect(result.allowed).toBe(true);
  });

  it("blocks when usage exceeds override cap", async () => {
    mockSelect
      .mockReturnValueOnce(chainMock([{ aiMonthlyCapOverride: 100 }]))
      .mockReturnValueOnce(chainMock([{ count: 100 }]));

    const result = await checkAiQuota("org-1", "PREMIUM");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("ai_monthly_cap_exceeded");
    }
  });
});
