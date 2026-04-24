import { describe, it, expect } from "vitest";
import { matchesAllowedOrigin } from "./originMatcher.js";

describe("matchesAllowedOrigin", () => {
  describe("empty / missing inputs", () => {
    it("rejects null origin", () => {
      expect(
        matchesAllowedOrigin(null, {
          allowedOrigins: ["example.com"],
          testMode: false,
        }),
      ).toBe(false);
    });

    it("rejects undefined origin", () => {
      expect(
        matchesAllowedOrigin(undefined, {
          allowedOrigins: ["example.com"],
          testMode: false,
        }),
      ).toBe(false);
    });

    it("rejects unparseable origin", () => {
      expect(
        matchesAllowedOrigin("not-a-url", {
          allowedOrigins: ["example.com"],
          testMode: false,
        }),
      ).toBe(false);
    });

    it("rejects when allow-list is empty (live mode)", () => {
      expect(
        matchesAllowedOrigin("https://example.com", {
          allowedOrigins: [],
          testMode: false,
        }),
      ).toBe(false);
    });
  });

  describe("exact match", () => {
    it("allows exact hostname", () => {
      expect(
        matchesAllowedOrigin("https://example.com", {
          allowedOrigins: ["example.com"],
          testMode: false,
        }),
      ).toBe(true);
    });

    it("is case-insensitive on both sides", () => {
      expect(
        matchesAllowedOrigin("https://Example.COM", {
          allowedOrigins: ["EXAMPLE.com"],
          testMode: false,
        }),
      ).toBe(true);
    });

    it("rejects unrelated hostname", () => {
      expect(
        matchesAllowedOrigin("https://evil.com", {
          allowedOrigins: ["example.com"],
          testMode: false,
        }),
      ).toBe(false);
    });

    it("rejects hostname that only contains allowed as suffix of another label", () => {
      expect(
        matchesAllowedOrigin("https://notexample.com", {
          allowedOrigins: ["example.com"],
          testMode: false,
        }),
      ).toBe(false);
    });

    it("rejects arbitrary subdomain when entry is non-wildcard", () => {
      // This is the tightening vs. today's permissive endsWith behavior.
      expect(
        matchesAllowedOrigin("https://evil.example.com", {
          allowedOrigins: ["example.com"],
          testMode: false,
        }),
      ).toBe(false);
    });

    it("matches any entry in the allow-list", () => {
      expect(
        matchesAllowedOrigin("https://second.com", {
          allowedOrigins: ["first.com", "second.com", "third.com"],
          testMode: false,
        }),
      ).toBe(true);
    });
  });

  describe("implicit www equivalence", () => {
    it("allows www.<apex> when entry is apex", () => {
      expect(
        matchesAllowedOrigin("https://www.example.com", {
          allowedOrigins: ["example.com"],
          testMode: false,
        }),
      ).toBe(true);
    });

    it("allows apex when entry is www.<apex>", () => {
      expect(
        matchesAllowedOrigin("https://example.com", {
          allowedOrigins: ["www.example.com"],
          testMode: false,
        }),
      ).toBe(true);
    });

    it("does not extend www equivalence to other subdomains", () => {
      expect(
        matchesAllowedOrigin("https://foo.example.com", {
          allowedOrigins: ["www.example.com"],
          testMode: false,
        }),
      ).toBe(false);
    });
  });

  describe("wildcard entries (*.apex)", () => {
    it("matches the apex", () => {
      expect(
        matchesAllowedOrigin("https://example.com", {
          allowedOrigins: ["*.example.com"],
          testMode: false,
        }),
      ).toBe(true);
    });

    it("matches a single-label subdomain", () => {
      expect(
        matchesAllowedOrigin("https://app.example.com", {
          allowedOrigins: ["*.example.com"],
          testMode: false,
        }),
      ).toBe(true);
    });

    it("matches a multi-label subdomain", () => {
      expect(
        matchesAllowedOrigin("https://foo.bar.example.com", {
          allowedOrigins: ["*.example.com"],
          testMode: false,
        }),
      ).toBe(true);
    });

    it("rejects an unrelated domain", () => {
      expect(
        matchesAllowedOrigin("https://evil.com", {
          allowedOrigins: ["*.example.com"],
          testMode: false,
        }),
      ).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(
        matchesAllowedOrigin("https://APP.Example.COM", {
          allowedOrigins: ["*.EXAMPLE.com"],
          testMode: false,
        }),
      ).toBe(true);
    });
  });

  describe("test-mode localhost leniency", () => {
    it("allows http://localhost in test mode", () => {
      expect(
        matchesAllowedOrigin("http://localhost", {
          allowedOrigins: ["example.com"],
          testMode: true,
        }),
      ).toBe(true);
    });

    it("allows https://localhost in test mode", () => {
      expect(
        matchesAllowedOrigin("https://localhost", {
          allowedOrigins: ["example.com"],
          testMode: true,
        }),
      ).toBe(true);
    });

    it("allows localhost with a port in test mode", () => {
      expect(
        matchesAllowedOrigin("http://localhost:3001", {
          allowedOrigins: ["example.com"],
          testMode: true,
        }),
      ).toBe(true);
    });

    it("allows *.localhost subdomains in test mode", () => {
      expect(
        matchesAllowedOrigin("http://tenant.localhost:3000", {
          allowedOrigins: ["example.com"],
          testMode: true,
        }),
      ).toBe(true);
    });

    it("rejects localhost in live mode even with empty allow-list", () => {
      expect(
        matchesAllowedOrigin("http://localhost:3001", {
          allowedOrigins: [],
          testMode: false,
        }),
      ).toBe(false);
    });

    it("rejects localhost in live mode when not in allow-list", () => {
      expect(
        matchesAllowedOrigin("http://localhost:3001", {
          allowedOrigins: ["example.com"],
          testMode: false,
        }),
      ).toBe(false);
    });

    it("does not treat 127.0.0.1 as localhost leniency", () => {
      expect(
        matchesAllowedOrigin("http://127.0.0.1:3000", {
          allowedOrigins: ["example.com"],
          testMode: true,
        }),
      ).toBe(false);
    });
  });

  describe("mixed allow-list", () => {
    it("matches any wildcard entry when many entries exist", () => {
      expect(
        matchesAllowedOrigin("https://shop.example.com", {
          allowedOrigins: ["other.com", "*.example.com", "third.com"],
          testMode: false,
        }),
      ).toBe(true);
    });

    it("allows via www equivalence when mixed with other entries", () => {
      expect(
        matchesAllowedOrigin("https://www.brand.com", {
          allowedOrigins: ["other.com", "brand.com"],
          testMode: false,
        }),
      ).toBe(true);
    });
  });
});
