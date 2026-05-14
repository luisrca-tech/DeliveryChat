import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLocalMessageSync } from "../useLocalMessageSync";

describe("useLocalMessageSync", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns undefined for a conversation with no stored message", () => {
    const { result } = renderHook(() => useLocalMessageSync());
    expect(result.current.getLastMessageId("conv-1")).toBeUndefined();
  });

  it("stores and retrieves a message id per conversation", () => {
    const { result } = renderHook(() => useLocalMessageSync());
    result.current.setLastMessageId("conv-1", "msg-abc");
    expect(result.current.getLastMessageId("conv-1")).toBe("msg-abc");
  });

  it("namespaces keys per conversation so different conversations don't interfere", () => {
    const { result } = renderHook(() => useLocalMessageSync());
    result.current.setLastMessageId("conv-1", "msg-001");
    result.current.setLastMessageId("conv-2", "msg-002");
    expect(result.current.getLastMessageId("conv-1")).toBe("msg-001");
    expect(result.current.getLastMessageId("conv-2")).toBe("msg-002");
  });

  it("uses dc_last_msg_ prefix for localStorage keys", () => {
    const { result } = renderHook(() => useLocalMessageSync());
    result.current.setLastMessageId("conv-xyz", "msg-xyz");
    expect(localStorage.getItem("dc_last_msg_conv-xyz")).toBe("msg-xyz");
  });

  it("does not affect other localStorage keys", () => {
    localStorage.setItem("unrelated_key", "value");
    const { result } = renderHook(() => useLocalMessageSync());
    result.current.setLastMessageId("conv-1", "msg-1");
    expect(localStorage.getItem("unrelated_key")).toBe("value");
  });

  it("keeps stable getLastMessageId and setLastMessageId references across re-renders", () => {
    const { result, rerender } = renderHook(() => useLocalMessageSync());
    const getRef = result.current.getLastMessageId;
    const setRef = result.current.setLastMessageId;
    rerender();
    expect(result.current.getLastMessageId).toBe(getRef);
    expect(result.current.setLastMessageId).toBe(setRef);
  });
});
