import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();

vi.mock("../../../db/index.js", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

vi.mock("../../../db/schema/users.js", () => ({ user: { id: "id" } }));

const { resolveOrCreateVisitor, ANONYMOUS_EMAIL_DOMAIN, DEFAULT_VISITOR_NAME } =
  await import("../visitor.service.js");

describe("resolveOrCreateVisitor", () => {
  const VISITOR_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the existing user ID when visitor already exists", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => [{ id: VISITOR_ID }] }),
      }),
    });

    const result = await resolveOrCreateVisitor(VISITOR_ID);

    expect(result).toBe(VISITOR_ID);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("creates a new anonymous user and returns the ID when visitor does not exist", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => [] }),
      }),
    });
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const result = await resolveOrCreateVisitor(VISITOR_ID);

    expect(result).toBe(VISITOR_ID);
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    const insertValues = mockDbInsert.mock.results[0]!.value.values;
    expect(insertValues).toHaveBeenCalledWith({
      id: VISITOR_ID,
      name: DEFAULT_VISITOR_NAME,
      email: `${VISITOR_ID}@${ANONYMOUS_EMAIL_DOMAIN}`,
      isAnonymous: true,
      status: "ACTIVE",
    });
  });

  it("handles concurrent calls safely via INSERT ON CONFLICT DO NOTHING", async () => {
    mockDbSelect.mockReturnValue({
      from: () => ({
        where: () => ({ limit: () => [] }),
      }),
    });
    const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: mockOnConflictDoNothing,
      }),
    });

    const result = await resolveOrCreateVisitor(VISITOR_ID);

    expect(result).toBe(VISITOR_ID);
    expect(mockOnConflictDoNothing).toHaveBeenCalled();
  });
});

describe("visitor constants", () => {
  it("exports the anonymous email domain", () => {
    expect(ANONYMOUS_EMAIL_DOMAIN).toBe("anonymous.deliverychat.online");
  });

  it("exports the default visitor name", () => {
    expect(DEFAULT_VISITOR_NAME).toBe("Visitor");
  });
});
