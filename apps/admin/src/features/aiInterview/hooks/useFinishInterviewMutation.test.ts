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
    postInterviewComplete: vi.fn(),
    postInterviewGenerateSummary: vi.fn(),
  };
});

import {
  InterviewClientError,
  postInterviewComplete,
  postInterviewGenerateSummary,
} from "../lib/aiInterview.client";
import {
  aiInterviewQueryKeys,
  useFinishInterviewMutation,
  useRetrySummaryGenerationMutation,
} from "./useInterviewState";
import type { InterviewState } from "../types/aiInterview.types";

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

function seed(queryClient: QueryClient, state: InterviewState) {
  queryClient.setQueryData(aiInterviewQueryKeys.state(APPLICATION_ID), state);
}

describe("useFinishInterviewMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chains complete then generate-summary on the happy path and marks the state completed", async () => {
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient, {
      status: "in_progress",
      currentTurn: 9,
      interviewLog: [
        { role: "assistant", content: "Hi" },
        { role: "user", content: "Hello" },
      ],
    });

    vi.mocked(postInterviewComplete).mockResolvedValueOnce({
      status: "completed",
      currentTurn: 9,
      completedBy: "user-1",
      completedAt: "2026-05-29T00:00:00.000Z",
    });
    vi.mocked(postInterviewGenerateSummary).mockResolvedValueOnce({
      status: "completed",
      contextSummary: "# Summary",
      aiEnabled: true,
    });

    const onChainSuccess = vi.fn();
    const { result } = renderHook(
      () => useFinishInterviewMutation(APPLICATION_ID, { onChainSuccess }),
      { wrapper },
    );

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(postInterviewComplete).toHaveBeenCalledWith(APPLICATION_ID, {
      expectedCurrentTurn: 9,
    });
    expect(postInterviewGenerateSummary).toHaveBeenCalledWith(APPLICATION_ID);
    expect(onChainSuccess).toHaveBeenCalledTimes(1);

    const cached = queryClient.getQueryData<InterviewState>(
      aiInterviewQueryKeys.state(APPLICATION_ID),
    );
    if (!cached || cached.status === "not_started") {
      throw new Error("expected completed state");
    }
    expect(cached.status).toBe("completed");
  });

  it("calls onCompleteError and skips generate-summary when /complete returns interview_checklist_incomplete", async () => {
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient, {
      status: "in_progress",
      currentTurn: 6,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    vi.mocked(postInterviewComplete).mockRejectedValueOnce(
      new InterviewClientError({
        code: "interview_checklist_incomplete",
        status: 422,
        message: "missing topics",
        missing: ["preferred_tone"],
      }),
    );

    const onCompleteError = vi.fn();
    const onSummaryError = vi.fn();
    const { result } = renderHook(
      () =>
        useFinishInterviewMutation(APPLICATION_ID, {
          onCompleteError,
          onSummaryError,
        }),
      { wrapper },
    );

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(onCompleteError).toHaveBeenCalledTimes(1);
    expect(onSummaryError).not.toHaveBeenCalled();
    expect(postInterviewGenerateSummary).not.toHaveBeenCalled();

    const cached = queryClient.getQueryData<InterviewState>(
      aiInterviewQueryKeys.state(APPLICATION_ID),
    );
    expect(cached?.status).toBe("in_progress");
  });

  it("calls onSummaryError when /generate-summary fails after a successful /complete", async () => {
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient, {
      status: "in_progress",
      currentTurn: 10,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    vi.mocked(postInterviewComplete).mockResolvedValueOnce({
      status: "completed",
      currentTurn: 10,
      completedBy: "user-1",
      completedAt: "2026-05-29T00:00:00.000Z",
    });
    vi.mocked(postInterviewGenerateSummary).mockRejectedValueOnce(
      new InterviewClientError({
        code: "summary_generation_failed",
        status: 422,
        message: "model broke",
      }),
    );

    const onCompleteError = vi.fn();
    const onSummaryError = vi.fn();
    const { result } = renderHook(
      () =>
        useFinishInterviewMutation(APPLICATION_ID, {
          onCompleteError,
          onSummaryError,
        }),
      { wrapper },
    );

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(onCompleteError).not.toHaveBeenCalled();
    expect(onSummaryError).toHaveBeenCalledTimes(1);
    expect(postInterviewGenerateSummary).toHaveBeenCalledTimes(1);
  });
});

describe("useRetrySummaryGenerationMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls only /generate-summary and never /complete", async () => {
    const { wrapper } = createWrapper();

    vi.mocked(postInterviewGenerateSummary).mockResolvedValueOnce({
      status: "completed",
      contextSummary: "# OK",
      aiEnabled: true,
    });

    const { result } = renderHook(
      () => useRetrySummaryGenerationMutation(APPLICATION_ID),
      { wrapper },
    );

    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(postInterviewGenerateSummary).toHaveBeenCalledTimes(1);
    expect(postInterviewComplete).not.toHaveBeenCalled();
  });
});
