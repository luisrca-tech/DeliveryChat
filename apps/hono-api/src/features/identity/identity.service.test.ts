import { describe, expect, it, vi, beforeEach } from "vitest";
import { upsertVisitorIdentity } from "./identity.service.js";
import { db } from "../../db/index.js";

vi.mock("../../db/index.js", () => {
  const insertReturning = vi.fn();
  const onConflict = vi.fn(() => ({ returning: insertReturning }));
  const values = vi.fn(() => ({ onConflictDoUpdate: onConflict }));
  const insert = vi.fn(() => ({ values }));

  return {
    db: {
      insert: insert,
      _mocks: { insert, values, onConflict, insertReturning },
    },
  };
});

type MockFn = ReturnType<typeof vi.fn>;
type Mocks = { insert: MockFn; values: MockFn; onConflict: MockFn; insertReturning: MockFn };

function getMocks(): Mocks {
  return (db as unknown as { _mocks: Mocks })._mocks;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertVisitorIdentity", () => {
  it("inserts a new identity record", async () => {
    const mockRecord = {
      id: "id-1",
      anonymousUserId: "visitor-1",
      organizationId: "org-1",
      externalId: "ext-1",
      email: "test@example.com",
      name: "Test User",
      metadata: { plan: "pro" },
      hmacVerified: true,
    };
    getMocks().insertReturning.mockResolvedValue([mockRecord]);

    const result = await upsertVisitorIdentity({
      anonymousUserId: "visitor-1",
      organizationId: "org-1",
      externalId: "ext-1",
      email: "test@example.com",
      name: "Test User",
      metadata: { plan: "pro" },
      hmacVerified: true,
    });

    expect(result).toEqual(mockRecord);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("uses onConflictDoUpdate for upsert behavior", async () => {
    getMocks().insertReturning.mockResolvedValue([{ id: "id-1" }]);

    await upsertVisitorIdentity({
      anonymousUserId: "visitor-1",
      organizationId: "org-1",
    });

    expect(getMocks().onConflict).toHaveBeenCalledTimes(1);
  });

  it("passes only provided fields (omits undefined)", async () => {
    getMocks().insertReturning.mockResolvedValue([{ id: "id-1" }]);

    await upsertVisitorIdentity({
      anonymousUserId: "visitor-1",
      organizationId: "org-1",
      email: "test@example.com",
    });

    const valuesCall = getMocks().values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(valuesCall?.anonymousUserId).toBe("visitor-1");
    expect(valuesCall?.organizationId).toBe("org-1");
    expect(valuesCall?.email).toBe("test@example.com");
    expect(valuesCall?.externalId).toBeUndefined();
  });

  it("defaults hmacVerified to false when not provided", async () => {
    getMocks().insertReturning.mockResolvedValue([{ id: "id-1" }]);

    await upsertVisitorIdentity({
      anonymousUserId: "visitor-1",
      organizationId: "org-1",
    });

    const valuesCall = getMocks().values.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(valuesCall?.hmacVerified).toBe(false);
  });
});
