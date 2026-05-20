import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminUrl, getDocumentationUrl } from "../urls";

const ORIGINAL_LOCATION = window.location;

function setProdHostname(hostname: string): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...ORIGINAL_LOCATION, hostname },
  });
}

function restoreLocation(): void {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
}

function stubAdminUrl(value: string | undefined): void {
  vi.stubEnv("PUBLIC_ADMIN_URL", value as string);
}

describe("getAdminUrl", () => {
  beforeEach(() => {
    setProdHostname("deliverychat.online");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    restoreLocation();
  });

  describe("happy paths", () => {
    it("auto-prefixes the tenant on a bare root host", () => {
      stubAdminUrl("https://deliverychat.online");

      expect(getAdminUrl("codewise")).toBe(
        "https://codewise.deliverychat.online",
      );
    });

    it("substitutes the [tenant] placeholder when present", () => {
      stubAdminUrl("https://[tenant].deliverychat.online");

      expect(getAdminUrl("codewise")).toBe(
        "https://codewise.deliverychat.online",
      );
    });

    it("substitutes the <tenant> placeholder when present", () => {
      stubAdminUrl("https://<tenant>.deliverychat.online");

      expect(getAdminUrl("codewise")).toBe(
        "https://codewise.deliverychat.online",
      );
    });

    it("normalizes tenant casing and trailing slashes", () => {
      stubAdminUrl("https://deliverychat.online/");

      expect(getAdminUrl("  CodeWise  ")).toBe(
        "https://codewise.deliverychat.online",
      );
    });
  });

  describe("reserved-subdomain guard", () => {
    it("throws when PUBLIC_ADMIN_URL points at the api host", () => {
      stubAdminUrl("https://api.deliverychat.online");

      expect(() => getAdminUrl("codewise")).toThrowError(
        /PUBLIC_ADMIN_URL.*reserved subdomain/i,
      );
    });

    it("throws when PUBLIC_ADMIN_URL points at the api-dev host", () => {
      stubAdminUrl("https://api-dev.deliverychat.online");

      expect(() => getAdminUrl("codewise")).toThrowError(
        /PUBLIC_ADMIN_URL.*reserved subdomain/i,
      );
    });

    it("throws when PUBLIC_ADMIN_URL points at the www host", () => {
      stubAdminUrl("https://www.deliverychat.online");

      expect(() => getAdminUrl("codewise")).toThrowError(
        /PUBLIC_ADMIN_URL.*reserved subdomain/i,
      );
    });

    it("does not flag hosts that merely contain 'api' as a substring", () => {
      stubAdminUrl("https://rapidly.deliverychat.online");

      expect(getAdminUrl("codewise")).toBe(
        "https://codewise.rapidly.deliverychat.online",
      );
    });
  });

  describe("missing config", () => {
    it("throws when PUBLIC_ADMIN_URL is missing in production", () => {
      stubAdminUrl(undefined);

      expect(() => getAdminUrl("codewise")).toThrowError(
        /PUBLIC_ADMIN_URL is required/i,
      );
    });
  });
});

describe("getDocumentationUrl", () => {
  afterEach(() => {
    restoreLocation();
  });

  it("returns localhost docs when hostname is localhost", () => {
    setProdHostname("localhost");

    expect(getDocumentationUrl()).toBe("http://localhost:3003");
  });
});
