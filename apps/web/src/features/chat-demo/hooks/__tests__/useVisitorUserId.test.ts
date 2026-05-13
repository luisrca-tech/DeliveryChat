import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVisitorUserId } from "../useVisitorUserId";

describe("useVisitorUserId", () => {
  it("starts with null visitorUserId", () => {
    const { result } = renderHook(() => useVisitorUserId());
    expect(result.current.visitorUserId).toBeNull();
  });

  it("captures visitorUserId from the first successful list response", () => {
    const { result } = renderHook(() => useVisitorUserId());

    act(() => {
      result.current.captureVisitorId("user-123");
    });

    expect(result.current.visitorUserId).toBe("user-123");
  });

  it("ignores null captures after the value has been set", () => {
    const { result } = renderHook(() => useVisitorUserId());

    act(() => {
      result.current.captureVisitorId("user-123");
    });

    act(() => {
      result.current.captureVisitorId(null);
    });

    expect(result.current.visitorUserId).toBe("user-123");
  });

  it("does not re-capture if already set", () => {
    const { result } = renderHook(() => useVisitorUserId());

    act(() => {
      result.current.captureVisitorId("user-first");
    });

    act(() => {
      result.current.captureVisitorId("user-second");
    });

    expect(result.current.visitorUserId).toBe("user-first");
  });
});
