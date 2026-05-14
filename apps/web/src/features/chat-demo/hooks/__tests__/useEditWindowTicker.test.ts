import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEditWindowTicker } from "../useEditWindowTicker";

describe("useEditWindowTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("triggers a re-render every 30 seconds", () => {
    const { result } = renderHook(() => useEditWindowTicker());
    const firstTick = result.current;

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(result.current).not.toBe(firstTick);
  });

  it("clears the interval on unmount", () => {
    const clearSpy = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = renderHook(() => useEditWindowTicker());
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  it("increments on each 30-second tick", () => {
    const { result } = renderHook(() => useEditWindowTicker());
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const second = result.current;

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    const third = result.current;

    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });
});
