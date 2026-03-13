import { describe, expect, it } from "vitest";
import { isValidLogoUrl } from "./logo-url.js";

describe("isValidLogoUrl", () => {
  it("returns false for undefined", () => {
    expect(isValidLogoUrl(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidLogoUrl("")).toBe(false);
  });

  it("returns false for whitespace-only string", () => {
    expect(isValidLogoUrl("   ")).toBe(false);
  });

  it("returns false for http protocol", () => {
    expect(isValidLogoUrl("http://example.com/logo.png")).toBe(false);
  });

  it("returns false for javascript protocol", () => {
    expect(isValidLogoUrl("javascript:alert(1)")).toBe(false);
  });

  it("returns false for data protocol", () => {
    expect(isValidLogoUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("returns true for valid https URL", () => {
    expect(isValidLogoUrl("https://example.com/logo.png")).toBe(true);
  });

  it("returns true for https URL with query params", () => {
    expect(isValidLogoUrl("https://cdn.example.com/img.png?v=1")).toBe(true);
  });

  it("returns true for https URL with trimmed whitespace", () => {
    expect(isValidLogoUrl("  https://example.com/logo.png  ")).toBe(true);
  });

  it("returns false for invalid URL", () => {
    expect(isValidLogoUrl("not-a-url")).toBe(false);
  });
});
