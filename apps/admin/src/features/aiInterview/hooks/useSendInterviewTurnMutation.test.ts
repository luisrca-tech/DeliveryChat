// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

vi.mock("../lib/aiInterview.client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/aiInterview.client")>();
  return {
    ...actual,
    postInterviewTurn: vi.fn(),
    getInterviewState: vi.fn(),
  };
});

import {
  InterviewTurnConflictError,
  postInterviewTurn,
} from "../lib/aiInterview.client";
import {
  aiInterviewQueryKeys,
  useSendInterviewTurnMutation,
} from "./useInterviewState";
import type {
  InterviewState,
  InterviewTurnResponse,
} from "../types/aiInterview.types";

const APPLICATION_ID = "app-1";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
  return { queryClient, wrapper };
}

function seedState(queryClient: QueryClient, state: InterviewState) {
  queryClient.setQueryData(
    aiInterviewQueryKeys.state(APPLICATION_ID),
    state,
  );
}

describe("useSendInterviewTurnMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("optimistically appends the user bubble, then replaces the cache with the server's authoritative log", async () => {
    const { queryClient, wrapper } = createWrapper();
    seedState(queryClient, {
      status: "in_progress",
      currentTurn: 1,
      interviewLog: [{ role: "assistant", content: "Hello?" }],
    });

    let resolveTurn: ((value: InterviewTurnResponse) => void) | null = null;
    vi.mocked(postInterviewTurn).mockImplementationOnce(
      () =>
        new Promise<InterviewTurnResponse>((resolve) => {
          resolveTurn = resolve;
        }),
    );

    const { result } = renderHook(
      () => useSendInterviewTurnMutation(APPLICATION_ID),
      { wrapper },
    );

    act(() => {
      result.current.mutate({ message: "We sell coffee." });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<InterviewState>(
        aiInterviewQueryKeys.state(APPLICATION_ID),
      );
      if (!cached || cached.status === "not_started") {
        throw new Error("expected active state");
      }
      expect(cached.interviewLog).toEqual([
        { role: "assistant", content: "Hello?" },
        { role: "user", content: "We sell coffee." },
      ]);
    });

    act(() => {
      resolveTurn?.({
        status: "in_progress",
        currentTurn: 2,
        interviewLog: [
          { role: "assistant", content: "Hello?" },
          { role: "user", content: "We sell coffee." },
          { role: "assistant", content: "Who are your customers?" },
        ],
        canFinish: false,
        turn: {
          intent: "ask",
          topicsCoveredThisTurn: ["business"],
          guardrailAction: "none",
        },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = queryClient.getQueryData<InterviewState>(
      aiInterviewQueryKeys.state(APPLICATION_ID),
    );
    if (!cached || cached.status === "not_started") {
      throw new Error("expected active state");
    }
    expect(cached.currentTurn).toBe(2);
    expect(cached.interviewLog).toHaveLength(3);
    expect(cached.interviewLog[2]?.role).toBe("assistant");
  });

  it("rolls back the optimistic bubble on error", async () => {
    const { queryClient, wrapper } = createWrapper();
    const seeded: InterviewState = {
      status: "in_progress",
      currentTurn: 1,
      interviewLog: [{ role: "assistant", content: "Hello?" }],
    };
    seedState(queryClient, seeded);

    vi.mocked(postInterviewTurn).mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(
      () => useSendInterviewTurnMutation(APPLICATION_ID),
      { wrapper },
    );

    act(() => {
      result.current.mutate({ message: "We sell coffee." });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const cached = queryClient.getQueryData<InterviewState>(
      aiInterviewQueryKeys.state(APPLICATION_ID),
    );
    expect(cached).toEqual(seeded);
  });

  it("on turn_conflict: rolls back optimistic bubble, invalidates the state query, and fires onTurnConflict", async () => {
    const { queryClient, wrapper } = createWrapper();
    const seeded: InterviewState = {
      status: "in_progress",
      currentTurn: 2,
      interviewLog: [
        { role: "assistant", content: "Hello?" },
        { role: "user", content: "Hi." },
        { role: "assistant", content: "Tell me more." },
      ],
    };
    seedState(queryClient, seeded);

    vi.mocked(postInterviewTurn).mockRejectedValueOnce(
      new InterviewTurnConflictError(3, "in_progress"),
    );

    const onTurnConflict = vi.fn();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(
      () => useSendInterviewTurnMutation(APPLICATION_ID, { onTurnConflict }),
      { wrapper },
    );

    act(() => {
      result.current.mutate({ message: "stale turn" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(onTurnConflict).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: aiInterviewQueryKeys.state(APPLICATION_ID),
    });
    const cached = queryClient.getQueryData<InterviewState>(
      aiInterviewQueryKeys.state(APPLICATION_ID),
    );
    expect(cached).toEqual(seeded);
  });

  it("sends expectedCurrentTurn derived from the cached state", async () => {
    const { queryClient, wrapper } = createWrapper();
    seedState(queryClient, {
      status: "in_progress",
      currentTurn: 4,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    vi.mocked(postInterviewTurn).mockResolvedValueOnce({
      status: "in_progress",
      currentTurn: 5,
      interviewLog: [
        { role: "assistant", content: "Hi" },
        { role: "user", content: "ok" },
        { role: "assistant", content: "?" },
      ],
      canFinish: false,
      turn: {
        intent: "ask",
        topicsCoveredThisTurn: [],
        guardrailAction: "none",
      },
    });

    const { result } = renderHook(
      () => useSendInterviewTurnMutation(APPLICATION_ID),
      { wrapper },
    );

    act(() => {
      result.current.mutate({ message: "ok" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(postInterviewTurn).toHaveBeenCalledWith(APPLICATION_ID, {
      message: "ok",
      expectedCurrentTurn: 4,
    });
  });

  it("exposes the failed message on the mutation variables so the composer can restore the draft", async () => {
    const { queryClient, wrapper } = createWrapper();
    seedState(queryClient, {
      status: "in_progress",
      currentTurn: 1,
      interviewLog: [{ role: "assistant", content: "Hello?" }],
    });

    vi.mocked(postInterviewTurn).mockRejectedValueOnce(new Error("boom"));

    const { result } = renderHook(
      () => useSendInterviewTurnMutation(APPLICATION_ID),
      { wrapper },
    );

    act(() => {
      result.current.mutate({ message: "draft to restore" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.variables?.message).toBe("draft to restore");
  });
});
