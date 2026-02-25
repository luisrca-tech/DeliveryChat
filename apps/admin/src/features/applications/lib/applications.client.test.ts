import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  listApplications,
  getApplication,
  createApplication,
  updateApplication,
  deleteApplication,
  ApplicationNotFoundError,
  ApplicationDomainConflictError,
} from "./applications.client";

vi.mock("@/lib/urls", () => ({
  getApiBaseUrl: () => "http://test/v1",
}));

vi.mock("@/lib/subdomain", () => ({
  getSubdomain: () => "tenant",
}));

vi.mock("@/lib/bearerToken", () => ({
  getBearerToken: () => "token",
}));

describe("applications.client", () => {
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
  });

  describe("getApplication", () => {
    it("returns application with activeApiKeysCount on success", async () => {
      const mockData = {
        application: { id: "a1", name: "App", domain: "app" },
        activeApiKeysCount: 3,
      };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData),
      } as Response);

      const result = await getApplication("a1");
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith(
        "http://test/v1/applications/a1",
        expect.any(Object),
      );
    });

    it("throws ApplicationNotFoundError on 404", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: "Not found" }),
      } as Response);

      await expect(getApplication("a1")).rejects.toThrow(
        ApplicationNotFoundError,
      );
    });
  });

  describe("createApplication", () => {
    it("returns application on success", async () => {
      const mockApp = {
        id: "a1",
        name: "New App",
        domain: "new-app",
        description: null,
        organizationId: "org1",
        settings: {},
        deletedAt: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ application: mockApp }),
      } as Response);

      const result = await createApplication({
        name: "New App",
        domain: "new-app",
      });
      expect(result.application).toEqual(mockApp);
    });

    it("throws ApplicationDomainConflictError on 409", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ message: "Domain already exists" }),
      } as Response);

      await expect(
        createApplication({ name: "App", domain: "existing" }),
      ).rejects.toThrow(ApplicationDomainConflictError);
    });
  });

  describe("updateApplication", () => {
    it("returns application on success", async () => {
      const mockApp = {
        id: "a1",
        name: "Updated App",
        domain: "app",
        description: "Updated",
        organizationId: "org1",
        settings: {},
        deletedAt: null,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ application: mockApp }),
      } as Response);

      const result = await updateApplication("a1", { name: "Updated App" });
      expect(result.application).toEqual(mockApp);
    });
  });

  describe("deleteApplication", () => {
    it("succeeds on 204", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await expect(deleteApplication("a1")).resolves.toBeUndefined();
    });

    it("throws ApplicationNotFoundError on 404", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: "Not found" }),
      } as Response);

      await expect(deleteApplication("a1")).rejects.toThrow(
        ApplicationNotFoundError,
      );
    });
  });
});
