import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocketReconnect } from "../useWebSocketReconnect";

describe("useWebSocketReconnect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires connectFn after 1 s on first attempt", () => {
    const connectFn = vi.fn();
    const attemptRef = { current: 0 };
    const { result } = renderHook(() => useWebSocketReconnect());

    act(() => {
      result.current.scheduleReconnect(attemptRef, connectFn);
    });

    expect(connectFn).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(connectFn).toHaveBeenCalledTimes(1);
    expect(attemptRef.current).toBe(1);
  });

  it("fires connectFn after 2 s on second attempt", () => {
    const connectFn = vi.fn();
    const attemptRef = { current: 1 };
    const { result } = renderHook(() => useWebSocketReconnect());

    act(() => {
      result.current.scheduleReconnect(attemptRef, connectFn);
    });

    act(() => {
      vi.advanceTimersByTime(1_999);
    });
    expect(connectFn).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(connectFn).toHaveBeenCalledTimes(1);
  });

  it("verifies full delay sequence: 1s → 2s → 4s → 8s → 16s → 30s (cap)", () => {
    const delays = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];
    const { result } = renderHook(() => useWebSocketReconnect());

    for (const [i, delay] of delays.entries()) {
      const connectFn = vi.fn();
      const attemptRef = { current: i };

      act(() => {
        result.current.scheduleReconnect(attemptRef, connectFn);
      });

      act(() => {
        vi.advanceTimersByTime(delay - 1);
      });
      expect(connectFn).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(connectFn).toHaveBeenCalledTimes(1);
    }
  });

  it("caps delay at 30 s for large attempt counts", () => {
    const connectFn = vi.fn();
    const attemptRef = { current: 100 };
    const { result } = renderHook(() => useWebSocketReconnect());

    act(() => {
      result.current.scheduleReconnect(attemptRef, connectFn);
    });

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(connectFn).toHaveBeenCalledTimes(1);
  });

  it("cancelReconnect prevents the scheduled connectFn from firing", () => {
    const connectFn = vi.fn();
    const attemptRef = { current: 0 };
    const { result } = renderHook(() => useWebSocketReconnect());

    act(() => {
      result.current.scheduleReconnect(attemptRef, connectFn);
      result.current.cancelReconnect();
    });

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(connectFn).not.toHaveBeenCalled();
  });
});
