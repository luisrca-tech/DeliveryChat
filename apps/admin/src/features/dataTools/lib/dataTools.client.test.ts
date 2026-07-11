import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDataTool,
  DataToolNameConflictError,
  DataToolsClientError,
  DataToolsFeatureLockedError,
  getDataSource,
  listDataTools,
  putDataSource,
  setDataToolEnabled,
  testDataTool,
} from "./dataTools.client";

vi.mock("@/lib/urls", () => ({
  getApiBaseUrl: () => "http://test/api/v1",
}));

vi.mock("@/lib/subdomain", () => ({
  getSubdomain: () => "tenant",
}));

vi.mock("@/lib/bearerToken", () => ({
  getBearerToken: () => "token",
}));

describe("dataTools.client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getDataSource", () => {
    it("returns null when no source is configured", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(null),
      } as Response);

      await expect(getDataSource("app1")).resolves.toBeNull();
    });

    it("returns the redacted source on success", async () => {
      const mockSource = {
        kind: "http",
        enabled: true,
        baseUrl: "https://api.example.com",
        allowedHost: "api.example.com",
        hasHeaders: true,
        headerNames: ["X-Api-Key"],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSource),
      } as Response);

      await expect(getDataSource("app1")).resolves.toEqual(mockSource);
    });

    it("throws DataToolsFeatureLockedError on 403 ai_db_feature_not_available", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            error: "ai_db_feature_not_available",
            message: "The AI database connection is not available.",
          }),
      } as Response);

      await expect(getDataSource("app1")).rejects.toThrow(
        DataToolsFeatureLockedError,
      );
    });
  });

  describe("putDataSource", () => {
    it("sends the body and returns the redacted source", async () => {
      const mockSource = {
        kind: "sql",
        enabled: true,
        hasConnectionString: true,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSource),
      } as Response);

      const result = await putDataSource("app1", {
        kind: "sql",
        connectionString: "postgres://user:pass@host/db",
      });
      expect(result).toEqual(mockSource);
      expect(fetch).toHaveBeenCalledWith(
        "http://test/api/v1/applications/app1/data-source",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  describe("listDataTools", () => {
    it("returns the tool list", async () => {
      const mockTools = [{ id: "t1", name: "searchProducts" }];
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockTools),
      } as Response);

      await expect(listDataTools("app1")).resolves.toEqual(mockTools);
    });
  });

  describe("createDataTool", () => {
    it("throws DataToolNameConflictError on 409", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            error: "conflict",
            message: "A tool with this name already exists",
          }),
      } as Response);

      await expect(
        createDataTool("app1", {
          name: "searchProducts",
          description: "Searches the product catalog",
          inputSchema: { properties: {} },
          backingType: "http",
          config: { method: "GET", urlTemplate: "/products" },
        }),
      ).rejects.toThrow(DataToolNameConflictError);
    });
  });

  describe("testDataTool", () => {
    it("resolves with an ok:false body without throwing (a normal test outcome)", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({ ok: false, error: "Timed out", kind: "timeout" }),
      } as Response);

      await expect(testDataTool("app1", "t1", {})).resolves.toEqual({
        ok: false,
        error: "Timed out",
        kind: "timeout",
      });
    });
  });

  describe("setDataToolEnabled", () => {
    it("throws DataToolsClientError on 400 when the tool was never tested", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "validation_error",
            message: "tool must pass a test request before enabling",
          }),
      } as Response);

      await expect(
        setDataToolEnabled("app1", "t1", true),
      ).rejects.toThrow(DataToolsClientError);
    });
  });
});
