import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  listApplications,
  listApiKeys,
  createApiKey,
  revokeApiKey,
  regenerateApiKey,
  ApiKeyNotFoundError,
  ApiKeyLimitError,
} from "./api-keys.client";

vi.mock("@/lib/urls", () => ({
  getApiBaseUrl: () => "http://test/v1",
}));

vi.mock("@/lib/subdomain", () => ({
  getSubdomain: () => "tenant",
}));

vi.mock("@/lib/bearerToken", () => ({
  getBearerToken: () => "token",
}));

describe("api-keys.client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listApplications", () => {
    it("returns applications on success", async () => {
      const mockData = {
        applications: [{ id: "a1", name: "App", domain: "app" }],
        limit: 10,
        offset: 0,
      };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await listApplications();
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith(
        "http://test/v1/applications?limit=100&offset=0",
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });

    it("throws on 404", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: "Not found" }),
      } as Response);

      await expect(listApplications()).rejects.toThrow(ApiKeyNotFoundError);
    });
  });

  describe("listApiKeys", () => {
    it("returns api keys on success", async () => {
      const mockData = {
        apiKeys: [{ id: "k1", keyPrefix: "dk_live_****", name: "Key" }],
        limit: 5,
        used: 1,
      };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await listApiKeys("app1");
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith(
        "http://test/v1/applications/app1/api-keys",
        expect.any(Object),
      );
    });
  });

  describe("createApiKey", () => {
    it("throws ApiKeyLimitError on 429", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ message: "Limit reached" }),
      } as Response);

      await expect(
        createApiKey("app1", { name: "Key", environment: "live" }),
      ).rejects.toThrow(ApiKeyLimitError);
    });

    it("returns created key on success", async () => {
      const mockData = {
        id: "k1",
        appId: "app1",
        key: "dk_live_abc123",
        keyPrefix: "dk_live_abc1",
        name: "Key",
        expiresAt: null,
        createdAt: "2025-01-01T00:00:00Z",
      };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await createApiKey("app1", { name: "Key" });
      expect(result).toEqual(mockData);
    });
  });

  describe("revokeApiKey", () => {
    it("throws ApiKeyNotFoundError on 404", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: "Not found" }),
      } as Response);

      await expect(revokeApiKey("key1")).rejects.toThrow(ApiKeyNotFoundError);
    });
  });

  describe("regenerateApiKey", () => {
    it("returns new key on success", async () => {
      const mockData = {
        id: "k2",
        appId: "app1",
        key: "dk_live_xyz789",
        keyPrefix: "dk_live_xyz7",
        name: "Key",
        expiresAt: null,
        createdAt: "2025-01-01T00:00:00Z",
      };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await regenerateApiKey("key1", { name: "New" });
      expect(result).toEqual(mockData);
    });
  });
});
