import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  hashApiKey,
  generateRawKey,
  validateOrigin,
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

describe("validateOrigin", () => {
  it("returns true when origin is null or undefined", () => {
    expect(validateOrigin(null, "example.com")).toBe(true);
    expect(validateOrigin(undefined, "example.com")).toBe(true);
  });

  it("allows exact domain match", () => {
    expect(validateOrigin("https://example.com", "example.com")).toBe(true);
    expect(validateOrigin("https://example.com/path", "example.com")).toBe(
      true,
    );
  });

  it("allows subdomain match", () => {
    expect(validateOrigin("https://app.example.com", "example.com")).toBe(true);
    expect(validateOrigin("https://foo.bar.example.com", "example.com")).toBe(
      true,
    );
  });

  it("blocks mismatched domain", () => {
    expect(validateOrigin("https://evil.com", "example.com")).toBe(false);
    expect(validateOrigin("https://example.evil.com", "example.com")).toBe(
      false,
    );
  });

  it("handles wildcard domain *.example.com", () => {
    expect(validateOrigin("https://app.example.com", "*.example.com")).toBe(
      true,
    );
    expect(validateOrigin("https://example.com", "*.example.com")).toBe(true);
    expect(validateOrigin("https://evil.com", "*.example.com")).toBe(false);
  });

  it("returns false for invalid origin URL", () => {
    expect(validateOrigin("not-a-url", "example.com")).toBe(false);
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

  it("returns not_found for unknown key", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as never);

    const result = await verifyApiKey("dk_live_unknown");
    expect(result).toEqual({ valid: false, reason: "not_found" });
  });

  it("returns revoked for revoked key", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "key_1",
                applicationId: "app-1",
                revokedAt: new Date(),
                expiresAt: null,
                appDomain: "example.com",
              },
            ]),
          }),
        }),
      }),
    } as never);

    const result = await verifyApiKey("dk_live_valid");
    expect(result).toEqual({ valid: false, reason: "revoked" });
  });

  it("returns expired for expired key", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "key_1",
                applicationId: "app-1",
                revokedAt: null,
                expiresAt: new Date("2020-01-01"),
                appDomain: "example.com",
              },
            ]),
          }),
        }),
      }),
    } as never);

    const result = await verifyApiKey("dk_live_valid");
    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("returns valid for active key", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "key_1",
                applicationId: "app-1",
                revokedAt: null,
                expiresAt: null,
                appDomain: "example.com",
              },
            ]),
          }),
        }),
      }),
    } as never);

    const result = await verifyApiKey("dk_live_valid");
    expect(result).toEqual({
      valid: true,
      application: { id: "app-1", domain: "example.com" },
      apiKey: { id: "key_1" },
    });
  });
});
