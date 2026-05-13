import { describe, it, expect, beforeEach } from "vitest";
import { resolveVisitorId, VISITOR_ID_KEY } from "../visitor";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("resolveVisitorId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates a UUID v4 on first visit", () => {
    const id = resolveVisitorId();
    expect(UUID_V4_REGEX.test(id)).toBe(true);
  });

  it("persists the generated UUID in localStorage under the correct key", () => {
    const id = resolveVisitorId();
    expect(localStorage.getItem(VISITOR_ID_KEY)).toBe(id);
  });

  it("returns the same UUID on subsequent calls", () => {
    const first = resolveVisitorId();
    const second = resolveVisitorId();
    expect(second).toBe(first);
  });

  it("generates a new UUID after localStorage is cleared", () => {
    const first = resolveVisitorId();
    localStorage.clear();
    const second = resolveVisitorId();
    expect(second).not.toBe(first);
    expect(UUID_V4_REGEX.test(second)).toBe(true);
  });

  it("does not clobber other localStorage keys", () => {
    localStorage.setItem("other_key", "other_value");
    resolveVisitorId();
    expect(localStorage.getItem("other_key")).toBe("other_value");
  });
});
