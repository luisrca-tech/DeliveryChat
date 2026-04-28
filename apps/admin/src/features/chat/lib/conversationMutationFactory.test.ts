import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildConversationMutationOptions } from "./conversationMutationFactory";
import type { ConversationsListResponse } from "../types/chat.types";

function makeListResponse(
  overrides: Partial<ConversationsListResponse> = {},
): ConversationsListResponse {
  return {
    conversations: [
      {
        id: "conv-1",
        organizationId: "org-1",
        applicationId: "app-1",
        status: "pending",
        createdBy: "visitor-1",
        assignedTo: null,
        subject: null,
        closedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        unreadCount: 0,
      },
      {
        id: "conv-2",
        organizationId: "org-1",
        applicationId: "app-1",
        status: "active",
        createdBy: "visitor-2",
        assignedTo: "operator-1",
        subject: "Help with order",
        closedAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T01:00:00Z",
        unreadCount: 2,
      },
    ],
    total: 2,
    limit: 50,
    offset: 0,
    ...overrides,
  };
}

function createMockQueryClient() {
  const cache = new Map<string, ConversationsListResponse>();
  cache.set("conversations", makeListResponse());

  return {
    cancelQueries: vi.fn().mockResolvedValue(undefined),
    getQueriesData: vi.fn().mockReturnValue([
      [["conversations"], makeListResponse()],
    ]),
    setQueriesData: vi.fn().mockImplementation((_filters, updater) => {
      if (typeof updater === "function") {
        const current = cache.get("conversations");
        cache.set("conversations", updater(current));
      }
    }),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    _cache: cache,
  };
}

describe("buildConversationMutationOptions", () => {
  let queryClient: ReturnType<typeof createMockQueryClient>;

  beforeEach(() => {
    queryClient = createMockQueryClient();
  });

  describe("with optimistic updater", () => {
    it("cancels in-flight queries on mutate", async () => {
      const options = buildConversationMutationOptions(queryClient as never, {
        mutationFn: vi.fn(),
        optimisticUpdater: (data) => data,
      });

      await options.onMutate!("conv-1");

      expect(queryClient.cancelQueries).toHaveBeenCalledWith({
        queryKey: ["conversations"],
      });
    });

    it("snapshots all conversation cache entries on mutate", async () => {
      const options = buildConversationMutationOptions(queryClient as never, {
        mutationFn: vi.fn(),
        optimisticUpdater: (data) => data,
      });

      const context = await options.onMutate!("conv-1");

      expect(queryClient.getQueriesData).toHaveBeenCalledWith({
        queryKey: ["conversations"],
      });
      expect(context?.snapshot).toEqual([
        [["conversations"], makeListResponse()],
      ]);
    });

    it("applies the optimistic updater via setQueriesData", async () => {
      const updater = vi.fn(
        (data: ConversationsListResponse, _id: string) => ({
          ...data,
          conversations: data.conversations.map((c) =>
            c.id === _id ? { ...c, status: "active" as const } : c,
          ),
        }),
      );

      const options = buildConversationMutationOptions(queryClient as never, {
        mutationFn: vi.fn(),
        optimisticUpdater: updater,
      });

      await options.onMutate!("conv-1");

      expect(queryClient.setQueriesData).toHaveBeenCalled();
      const setCall = queryClient.setQueriesData.mock.calls[0]!;
      expect(setCall[0]).toEqual({ queryKey: ["conversations"] });

      const applyFn = setCall[1] as (
        old: ConversationsListResponse | undefined,
      ) => ConversationsListResponse | undefined;
      const result = applyFn(makeListResponse());
      expect(result?.conversations[0]?.status).toBe("active");
    });

    it("rolls back to snapshot on error", async () => {
      const snapshot: [readonly unknown[], ConversationsListResponse][] = [
        [["conversations", "list", {}], makeListResponse()],
      ];

      const options = buildConversationMutationOptions(queryClient as never, {
        mutationFn: vi.fn(),
        optimisticUpdater: (data) => data,
      });

      options.onError!(new Error("fail"), "conv-1", { snapshot });

      expect(queryClient.setQueryData).toHaveBeenCalledWith(
        ["conversations", "list", {}],
        makeListResponse(),
      );
    });

    it("does not roll back when context has no snapshot", () => {
      const options = buildConversationMutationOptions(queryClient as never, {
        mutationFn: vi.fn(),
        optimisticUpdater: (data) => data,
      });

      options.onError!(new Error("fail"), "conv-1", undefined);

      expect(queryClient.setQueryData).not.toHaveBeenCalled();
    });

    it("invalidates all conversation queries on settled", async () => {
      const options = buildConversationMutationOptions(queryClient as never, {
        mutationFn: vi.fn(),
        optimisticUpdater: (data) => data,
      });

      await options.onSettled!();

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["conversations"],
      });
    });
  });

  describe("without optimistic updater (simple mutation)", () => {
    it("does not define onMutate", () => {
      const options = buildConversationMutationOptions(queryClient as never, {
        mutationFn: vi.fn(),
      });

      expect(options.onMutate).toBeUndefined();
    });

    it("does not define onError", () => {
      const options = buildConversationMutationOptions(queryClient as never, {
        mutationFn: vi.fn(),
      });

      expect(options.onError).toBeUndefined();
    });

    it("invalidates all conversation queries on settled", async () => {
      const options = buildConversationMutationOptions(queryClient as never, {
        mutationFn: vi.fn(),
      });

      await options.onSettled!();

      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["conversations"],
      });
    });
  });

  it("passes mutationFn through unchanged", () => {
    const mutationFn = vi.fn();
    const options = buildConversationMutationOptions(queryClient as never, {
      mutationFn,
    });

    expect(options.mutationFn).toBe(mutationFn);
  });
});
