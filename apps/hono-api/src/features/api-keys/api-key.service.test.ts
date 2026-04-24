import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  hashApiKey,
  generateRawKey,
  createApiKey,
  verifyApiKey,
  ApiKeyLimitError,
} from "./api-key.service.js";
import { db } from "../../db/index.js";

vi.mock("../../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn((fn) => fn({})),
  },
}));

describe("hashApiKey", () => {
  it("returns deterministic SHA-256 hex hash", () => {
    const key = "dk_live_abc123";
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different hashes for different inputs", () => {
    expect(hashApiKey("a")).not.toBe(hashApiKey("b"));
  });
});

describe("generateRawKey", () => {
  it("produces key with dk_live_ prefix and 32 random chars", () => {
    const key = generateRawKey("live");
    expect(key).toMatch(/^dk_live_[a-zA-Z0-9]{32}$/);
    expect(key).toHaveLength(40);
  });

  it("produces key with dk_test_ prefix for test env", () => {
    const key = generateRawKey("test");
    expect(key).toMatch(/^dk_test_[a-zA-Z0-9]{32}$/);
  });

  it("produces unique keys on each call", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) keys.add(generateRawKey());
    expect(keys.size).toBe(100);
  });
});

describe("createApiKey", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    vi.mocked(db.insert).mockReset();
  });

  it("throws ApiKeyLimitError when at max keys", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 10 }]),
      }),
    } as never);

    await expect(
      createApiKey({ applicationId: "app-123" }, 10),
    ).rejects.toThrow(ApiKeyLimitError);
  });

  it("succeeds when under limit", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      }),
    } as never);
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as never);

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: "key_abc",
          applicationId: "app-123",
          keyPrefix: "dk_live_a1B2c3D4",
          name: "Test",
          environment: "live",
          createdAt: new Date(),
        },
      ]),
    };
    vi.mocked(db.select).mockReturnValue(selectChain as never);

    const result = await createApiKey({
      applicationId: "app-123",
      name: "Test",
    });

    expect(result).toMatchObject({
      id: "key_abc",
      applicationId: "app-123",
      keyPrefix: "dk_live_a1B2c3D4",
      name: "Test",
      environment: "live",
    });
    expect(result.key).toMatch(/^dk_live_/);
  });
});

describe("verifyApiKey", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
  });

  function mockQueryReturning(rows: unknown[]) {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    } as never);
  }

  it("returns not_found for unknown key", async () => {
    mockQueryReturning([]);
    const result = await verifyApiKey("dk_live_unknown");
    expect(result).toEqual({ valid: false, reason: "not_found" });
  });

  it("returns revoked for revoked key", async () => {
    mockQueryReturning([
      {
        id: "key_1",
        applicationId: "app-1",
        environment: "live",
        revokedAt: new Date(),
        expiresAt: null,
        appDomain: "example.com",
        appAllowedOrigins: ["example.com"],
        appOrganizationId: "org-1",
      },
    ]);
    const result = await verifyApiKey("dk_live_valid");
    expect(result).toEqual({ valid: false, reason: "revoked" });
  });

  it("returns expired for expired key", async () => {
    mockQueryReturning([
      {
        id: "key_1",
        applicationId: "app-1",
        environment: "live",
        revokedAt: null,
        expiresAt: new Date("2020-01-01"),
        appDomain: "example.com",
        appAllowedOrigins: ["example.com"],
        appOrganizationId: "org-1",
      },
    ]);
    const result = await verifyApiKey("dk_live_valid");
    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("returns valid with allowed origins and environment for active key", async () => {
    mockQueryReturning([
      {
        id: "key_1",
        applicationId: "app-1",
        environment: "test",
        revokedAt: null,
        expiresAt: null,
        appDomain: "example.com",
        appAllowedOrigins: ["example.com", "*.example.com"],
        appOrganizationId: "org-1",
      },
    ]);
    const result = await verifyApiKey("dk_test_valid");
    expect(result).toEqual({
      valid: true,
      application: {
        id: "app-1",
        domain: "example.com",
        allowedOrigins: ["example.com", "*.example.com"],
        organizationId: "org-1",
      },
      apiKey: { id: "key_1", environment: "test" },
    });
  });
});
