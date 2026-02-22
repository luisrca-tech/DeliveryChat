import { describe, expect, it } from "vitest";
import { parseDomainFromInput } from "./parseDomainFromInput";

describe("parseDomainFromInput", () => {
  it("extracts hostname from full URL with https", () => {
    expect(parseDomainFromInput("https://app.codewise.online/")).toBe(
      "app.codewise.online",
    );
  });

  it("extracts hostname from full URL with http", () => {
    expect(parseDomainFromInput("http://example.com")).toBe("example.com");
  });

  it("adds https when no protocol given", () => {
    expect(parseDomainFromInput("app.codewise.online")).toBe(
      "app.codewise.online",
    );
  });

  it("returns lowercase hostname", () => {
    expect(parseDomainFromInput("https://App.Example.COM/")).toBe(
      "app.example.com",
    );
  });

  it("trims whitespace", () => {
    expect(parseDomainFromInput("  https://example.com  ")).toBe("example.com");
  });

  it("returns empty string for empty input", () => {
    expect(parseDomainFromInput("")).toBe("");
  });
});
