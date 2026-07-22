import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  ApplicationDomainConflictError,
  ApplicationPortConflictError,
  createApplication,
  getApplication,
  getApplicationSettings,
  updateApplication,
  deleteApplication,
  countActiveApiKeys,
  isUniqueViolation,
} from "./application.service.js";
import { db } from "../../db/index.js";

vi.mock("../../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn((fn: (tx: unknown) => Promise<boolean>) => fn({})),
  },
}));

const mockApp = {
  id: "app-123",
  organizationId: "org-1",
  name: "Test App",
  domain: "test-app",
  description: "A test app",
  settings: {},
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("isUniqueViolation", () => {
  it("returns true for Postgres unique violation code 23505", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("returns false for other error codes", () => {
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation({ code: "42P01" })).toBe(false);
  });

  it("returns false for null or non-object", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("error")).toBe(false);
  });

  it("returns true when Postgres 23505 is wrapped as cause (DrizzleQueryError)", () => {
    const wrapped = Object.assign(new Error("query failed"), {
      name: "DrizzleQueryError",
      cause: { code: "23505" },
    });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("returns false when wrapped cause is a non-unique-violation code", () => {
    const wrapped = Object.assign(new Error("query failed"), {
      name: "DrizzleQueryError",
      cause: { code: "23503" },
    });
    expect(isUniqueViolation(wrapped)).toBe(false);
  });
});

describe("getApplicationSettings", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
  });

  it("returns null when no app found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never);

    const result = await getApplicationSettings("app-123");
    expect(result).toBeNull();
  });

  it("returns null when app is deleted", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never);

    const result = await getApplicationSettings("deleted-app");
    expect(result).toBeNull();
  });

  it("returns settings when app found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([
              { settings: { colors: { primary: "#ff0000" } } },
            ]),
        }),
      }),
    } as never);

    const result = await getApplicationSettings("app-123");
    expect(result).toEqual({ colors: { primary: "#ff0000" } });
  });
});

describe("getApplication", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
  });

  it("returns null when no app found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never);

    const result = await getApplication("app-123", "org-1");
    expect(result).toBeNull();
  });

  it("returns app when found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockApp]),
        }),
      }),
    } as never);

    const result = await getApplication("app-123", "org-1");
    expect(result).toEqual(mockApp);
  });
});

describe("updateApplication", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    vi.mocked(db.update).mockReset();
  });

  it("returns null when app not found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never);

    const result = await updateApplication("app-123", "org-1", {
      name: "Updated",
    });
    expect(result).toBeNull();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns updated app when valid", async () => {
    const updatedApp = { ...mockApp, name: "Updated Name" };
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockApp]),
        }),
      }),
    } as never);
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([updatedApp]),
        }),
      }),
    } as never);

    const result = await updateApplication("app-123", "org-1", {
      name: "Updated Name",
    });
    expect(result).toEqual(updatedApp);
  });

  it("passes allowedOrigins to update when provided", async () => {
    const origins = ["example.com", "*.example.com"];
    const updatedApp = { ...mockApp, allowedOrigins: origins };
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockApp]),
        }),
      }),
    } as never);

    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([updatedApp]),
      }),
    });
    vi.mocked(db.update).mockReturnValue({ set: mockSet } as never);

    const result = await updateApplication("app-123", "org-1", {
      allowedOrigins: origins,
    });
    expect(result).toEqual(updatedApp);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ allowedOrigins: origins }),
    );
  });

  it("passes aiAutoRespond and aiDbEnabled to update when provided", async () => {
    const updatedApp = {
      ...mockApp,
      aiAutoRespond: true,
      aiDbEnabled: true,
    };
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockApp]),
        }),
      }),
    } as never);

    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([updatedApp]),
      }),
    });
    vi.mocked(db.update).mockReturnValue({ set: mockSet } as never);

    const result = await updateApplication("app-123", "org-1", {
      aiAutoRespond: true,
      aiDbEnabled: true,
    });
    expect(result).toEqual(updatedApp);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ aiAutoRespond: true, aiDbEnabled: true }),
    );
  });

  it("does not touch aiAutoRespond/aiDbEnabled when not provided", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockApp]),
        }),
      }),
    } as never);

    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockApp]),
      }),
    });
    vi.mocked(db.update).mockReturnValue({ set: mockSet } as never);

    await updateApplication("app-123", "org-1", { name: "Updated" });
    expect(mockSet).toHaveBeenCalledTimes(1);
    const setArg = mockSet.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(setArg).toBeDefined();
    expect(setArg).not.toHaveProperty("aiAutoRespond");
    expect(setArg).not.toHaveProperty("aiDbEnabled");
  });
});

describe("countActiveApiKeys", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
  });

  it("returns count of active keys", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 3 }]),
      }),
    } as never);

    const result = await countActiveApiKeys("app-123");
    expect(result).toBe(3);
  });

  it("returns 0 when no keys", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    } as never);

    const result = await countActiveApiKeys("app-123");
    expect(result).toBe(0);
  });
});

describe("createApplication", () => {
  beforeEach(() => {
    vi.mocked(db.insert).mockReset();
    vi.mocked(db.select).mockReset();
  });

  const mockInsertSuccess = (row: unknown) => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([row]),
      }),
    } as never);
  };

  const mockInsertReject = (err: unknown) => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockRejectedValue(err),
      }),
    } as never);
  };

  it("creates a production application with allowedOrigins=[domain]", async () => {
    const created = { ...mockApp, name: "Prod", domain: "app.example.com" };
    mockInsertSuccess(created);

    const result = await createApplication("org-1", {
      kind: "production",
      name: "Prod",
      domain: "app.example.com",
    });
    expect(result).toEqual(created);
  });

  it("throws ApplicationDomainConflictError on production unique violation", async () => {
    mockInsertReject(
      Object.assign(new Error("dup"), {
        name: "DrizzleQueryError",
        cause: { code: "23505" },
      }),
    );

    await expect(
      createApplication("org-1", {
        kind: "production",
        name: "Prod",
        domain: "app.example.com",
      }),
    ).rejects.toBeInstanceOf(ApplicationDomainConflictError);
  });

  it("throws ApplicationPortConflictError naming the conflicting app for test kind", async () => {
    mockInsertReject(
      Object.assign(new Error("dup"), {
        name: "DrizzleQueryError",
        cause: { code: "23505" },
      }),
    );
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ name: "Existing Local" }]),
        }),
      }),
    } as never);

    let caught: unknown;
    try {
      await createApplication("org-1", {
        kind: "test",
        name: "Local",
        domain: "localhost",
        port: 3000,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApplicationPortConflictError);
    expect((caught as ApplicationPortConflictError).port).toBe(3000);
    expect((caught as ApplicationPortConflictError).conflictingAppName).toBe(
      "Existing Local",
    );
  });

  it("re-throws unknown errors unchanged", async () => {
    const err = new Error("boom");
    mockInsertReject(err);
    await expect(
      createApplication("org-1", {
        kind: "production",
        name: "Prod",
        domain: "app.example.com",
      }),
    ).rejects.toBe(err);
  });
});

describe("deleteApplication", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      const mockTx = {
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
      };
      return fn(mockTx as never) as Promise<boolean>;
    });
  });

  it("returns false when app not found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never);

    const result = await deleteApplication("app-123", "org-1");
    expect(result).toBe(false);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("returns true and runs transaction when app found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([mockApp]),
        }),
      }),
    } as never);

    const mockTx = {
      update: vi
        .fn()
        .mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        })
        .mockReturnValueOnce({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "app-123" }]),
            }),
          }),
        }),
    };

    vi.mocked(db.transaction).mockImplementation(async (fn) => {
      return fn(mockTx as never) as Promise<boolean>;
    });

    const result = await deleteApplication("app-123", "org-1");
    expect(result).toBe(true);
    expect(db.transaction).toHaveBeenCalled();
  });
});
