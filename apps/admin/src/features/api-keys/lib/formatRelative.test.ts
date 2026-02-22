import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { formatRelative } from "./formatRelative";

describe("formatRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-02-22T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for recent times", () => {
    const iso = new Date(Date.now() - 30_000).toISOString();
    expect(formatRelative(iso)).toBe("just now");
  });

  it("returns minutes ago for < 1 hour", () => {
    const iso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelative(iso)).toBe("5 minutes ago");
  });

  it("returns singular minute", () => {
    const iso = new Date(Date.now() - 1 * 60 * 1000).toISOString();
    expect(formatRelative(iso)).toBe("1 minute ago");
  });

  it("returns hours ago for < 24 hours", () => {
    const iso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelative(iso)).toBe("2 hours ago");
  });

  it("returns days ago for < 7 days", () => {
    const iso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelative(iso)).toBe("3 days ago");
  });

  it("returns locale date for older dates", () => {
    const iso = "2024-01-15T00:00:00Z";
    expect(formatRelative(iso)).toMatch(/\d/);
  });
});
