import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const mockMutateAsync = vi.fn();
const mockNavigate = vi.fn();
const mockSetActiveRoom = vi.fn();
const mockSessionData = { user: { id: "user-1" } };

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("@/routes/_system/conversations", () => ({
  Route: {
    fullPath: "/conversations",
    useSearch: () => ({ filter: "queue" }),
  },
}));

vi.mock("@/lib/authClient", () => ({
  authClient: {
    useSession: () => ({ data: mockSessionData }),
  },
}));

vi.mock("./useConversationMutations", () => ({
  useAcceptConversationMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useLeaveConversationMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useResolveConversationMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/conversations.client", () => ({
  ConversationConflictError: class ConversationConflictError extends Error {
    constructor() {
      super("conflict");
      this.name = "ConversationConflictError";
    }
  },
}));

import { useConversationAction } from "./useConversationAction";
import { toast } from "sonner";
import { ConversationConflictError } from "../lib/conversations.client";

describe("useConversationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("uniform interface", () => {
    it.each(["accept", "leave", "resolve"] as const)(
      "returns { execute, isPending } for %s action",
      (actionType) => {
        const { result } = renderHook(() =>
          useConversationAction(actionType, "operator", mockSetActiveRoom),
        );
        expect(result.current).toHaveProperty("execute");
        expect(result.current).toHaveProperty("isPending");
        expect(typeof result.current.execute).toBe("function");
        expect(typeof result.current.isPending).toBe("boolean");
      },
    );
  });

  describe("accept", () => {
    it("calls mutation, navigates, shows toast, and calls setActiveRoom on success", async () => {
      mockMutateAsync.mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useConversationAction("accept", "operator", mockSetActiveRoom),
      );

      let ok: boolean;
      await act(async () => {
        ok = await result.current.execute("conv-1");
      });

      expect(ok!).toBe(true);
      expect(mockMutateAsync).toHaveBeenCalledWith("conv-1");
      expect(mockNavigate).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith("Conversation accepted");
      expect(mockSetActiveRoom).toHaveBeenCalledWith("conv-1", undefined, true);
    });

    it("shows conflict error toast on ConversationConflictError", async () => {
      mockMutateAsync.mockRejectedValue(new ConversationConflictError());
      const { result } = renderHook(() =>
        useConversationAction("accept", "operator", mockSetActiveRoom),
      );

      let ok: boolean;
      await act(async () => {
        ok = await result.current.execute("conv-1");
      });

      expect(ok!).toBe(false);
      expect(toast.error).toHaveBeenCalledWith(
        "Already taken by another operator",
      );
    });
  });

  describe("leave", () => {
    it("calls mutation, navigates to queue, and shows toast on success", async () => {
      mockMutateAsync.mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useConversationAction("leave", "operator"),
      );

      let ok: boolean;
      await act(async () => {
        ok = await result.current.execute("conv-1");
      });

      expect(ok!).toBe(true);
      expect(mockMutateAsync).toHaveBeenCalledWith("conv-1");
      expect(toast.success).toHaveBeenCalledWith(
        "Left conversation — returned to queue",
      );
    });

    it("shows error toast on failure", async () => {
      mockMutateAsync.mockRejectedValue(new Error("network"));
      const { result } = renderHook(() =>
        useConversationAction("leave", "operator"),
      );

      let ok: boolean;
      await act(async () => {
        ok = await result.current.execute("conv-1");
      });

      expect(ok!).toBe(false);
      expect(toast.error).toHaveBeenCalledWith("Failed to leave conversation");
    });
  });

  describe("resolve", () => {
    it("calls mutation, navigates to closed, and shows toast on success", async () => {
      mockMutateAsync.mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useConversationAction("resolve", "operator"),
      );

      let ok: boolean;
      await act(async () => {
        ok = await result.current.execute("conv-1");
      });

      expect(ok!).toBe(true);
      expect(mockMutateAsync).toHaveBeenCalledWith("conv-1");
      expect(toast.success).toHaveBeenCalledWith(
        "Conversation marked as solved",
      );
    });

    it("shows error toast on failure", async () => {
      mockMutateAsync.mockRejectedValue(new Error("network"));
      const { result } = renderHook(() =>
        useConversationAction("resolve", "operator"),
      );

      let ok: boolean;
      await act(async () => {
        ok = await result.current.execute("conv-1");
      });

      expect(ok!).toBe(false);
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to resolve conversation",
      );
    });
  });
});
