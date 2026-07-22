import { describe, expect, it } from "vitest";

import {
  emailVerifiedTimestamp,
  timestampString,
  timestampStringNullable,
} from "./customTypes";

function callFromDriver<T>(
  customTypeBuilder: (...args: unknown[]) => unknown,
  value: T,
): unknown {
  const col = customTypeBuilder() as {
    config: {
      customTypeParams: { fromDriver: (value: T) => unknown };
    };
  };
  return col.config.customTypeParams.fromDriver(value);
}

describe("timestampString", () => {
  it("appends Z to bare timestamp", () => {
    const result = callFromDriver(timestampString, "2025-01-15 14:30:00");
    expect(result).toBe("2025-01-15 14:30:00Z");
  });

  it("does not double-append Z if already present", () => {
    const result = callFromDriver(timestampString, "2025-01-15T14:30:00Z");
    expect(result).toBe("2025-01-15T14:30:00Z");
  });

  it("does not append Z if value has a timezone offset", () => {
    const result = callFromDriver(timestampString, "2025-01-15T14:30:00+03:00");
    expect(result).toBe("2025-01-15T14:30:00+03:00");
  });

  it("does not append Z if value has a negative timezone offset", () => {
    const result = callFromDriver(timestampString, "2025-01-15T14:30:00-05:00");
    expect(result).toBe("2025-01-15T14:30:00-05:00");
  });
});

describe("timestampStringNullable", () => {
  it("appends Z to bare timestamp", () => {
    const result = callFromDriver(
      timestampStringNullable,
      "2025-01-15 14:30:00",
    );
    expect(result).toBe("2025-01-15 14:30:00Z");
  });

  it("returns null for null value", () => {
    const result = callFromDriver(timestampStringNullable, null);
    expect(result).toBeNull();
  });

  it("does not double-append Z if already present", () => {
    const result = callFromDriver(
      timestampStringNullable,
      "2025-01-15T14:30:00Z",
    );
    expect(result).toBe("2025-01-15T14:30:00Z");
  });

  it("does not append Z if value has a timezone offset", () => {
    const result = callFromDriver(
      timestampStringNullable,
      "2025-01-15T14:30:00+03:00",
    );
    expect(result).toBe("2025-01-15T14:30:00+03:00");
  });
});

describe("emailVerifiedTimestamp", () => {
  it("appends Z to bare timestamp", () => {
    const result = callFromDriver(
      emailVerifiedTimestamp,
      "2025-01-15 14:30:00",
    );
    expect(result).toBe("2025-01-15 14:30:00Z");
  });

  it("returns null for null value", () => {
    const result = callFromDriver(emailVerifiedTimestamp, null);
    expect(result).toBeNull();
  });

  it("does not double-append Z if already present", () => {
    const result = callFromDriver(
      emailVerifiedTimestamp,
      "2025-01-15T14:30:00Z",
    );
    expect(result).toBe("2025-01-15T14:30:00Z");
  });

  it("does not append Z if value has a timezone offset", () => {
    const result = callFromDriver(
      emailVerifiedTimestamp,
      "2025-01-15T14:30:00+03:00",
    );
    expect(result).toBe("2025-01-15T14:30:00+03:00");
  });
});
