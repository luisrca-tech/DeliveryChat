import { describe, it, expect, beforeEach } from "vitest";
import { resolveVisitorId } from "../chat-client";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("resolveVisitorId", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates a UUID v4 when localStorage has no visitor id", () => {
    const id = resolveVisitorId();
    expect(UUID_V4_REGEX.test(id)).toBe(true);
  });

  it("persists the generated UUID in localStorage", () => {
    const id = resolveVisitorId();
    expect(localStorage.getItem("dc_visitor_id")).toBe(id);
  });

  it("returns the same UUID on a second call within the same session", () => {
    const first = resolveVisitorId();
    const second = resolveVisitorId();
    expect(first).toBe(second);
  });

  it("generates a new UUID after localStorage is cleared", () => {
    const first = resolveVisitorId();
    localStorage.clear();
    const second = resolveVisitorId();
    expect(second).not.toBe(first);
    expect(UUID_V4_REGEX.test(second)).toBe(true);
  });
});
