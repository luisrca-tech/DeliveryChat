import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

vi.mock("../lib/aiInterview.client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../lib/aiInterview.client")>();
  return {
    ...actual,
    getInterviewState: vi.fn(),
    postInterviewTurn: vi.fn(),
    postInterviewComplete: vi.fn(),
    postInterviewGenerateSummary: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import {
  InterviewClientError,
  InterviewTurnConflictError,
  getInterviewState,
  postInterviewComplete,
  postInterviewGenerateSummary,
  postInterviewTurn,
} from "../lib/aiInterview.client";
import { toast } from "sonner";
import { useInterviewController } from "./useInterviewController";
import { aiInterviewQueryKeys } from "./useInterviewState";
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

function seed(queryClient: QueryClient, state: InterviewState) {
  queryClient.setQueryData(aiInterviewQueryKeys.state(APPLICATION_ID), state);
  vi.mocked(getInterviewState).mockResolvedValue(state);
}

function turnOk(
  overrides: Partial<InterviewTurnResponse> = {},
): InterviewTurnResponse {
  return {
    status: "in_progress",
    currentTurn: 2,
    interviewLog: [
      { role: "assistant", content: "Hi" },
      { role: "user", content: "msg" },
      { role: "assistant", content: "Next?" },
    ],
    canFinish: false,
    turn: {
      intent: "ask",
      topicsCoveredThisTurn: [],
      guardrailAction: "none",
    },
    ...overrides,
  };
}

describe("useInterviewController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getInterviewState).mockResolvedValue({ status: "not_started" });
  });

  it("returns loading then intro phase when interview has not started", async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );

    expect(result.current.phase).toBe("loading");
    await waitFor(() => expect(result.current.phase).toBe("intro"));
  });

  it("transitions to active when seeded with an in-progress state", async () => {
    const { queryClient, wrapper } = createWrapper();
    vi.mocked(getInterviewState).mockResolvedValueOnce({
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 1,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });
    seed(queryClient, {
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 1,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );

    await waitFor(() => expect(result.current.phase).toBe("active"));
    expect(result.current.turnLog).toHaveLength(1);
    expect(result.current.progress.currentTurn).toBe(1);
  });

  it("optimistically updates the turn log and syncs progress after success", async () => {
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient, {
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 1,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    vi.mocked(postInterviewTurn).mockResolvedValueOnce(
      turnOk({ canFinish: true }),
    );

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );

    await waitFor(() => expect(result.current.phase).toBe("active"));

    act(() => result.current.callbacks.sendTurn("msg"));

    await waitFor(() => expect(result.current.progress.canFinish).toBe(true));
    expect(result.current.turnLog.length).toBeGreaterThanOrEqual(2);
  });

  it("rolls back optimistic log and produces a retry_row error surface on transient failure", async () => {
    const { queryClient, wrapper } = createWrapper();
    const seeded: InterviewState = {
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 2,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    };
    seed(queryClient, seeded);

    vi.mocked(postInterviewTurn).mockRejectedValueOnce(
      new InterviewClientError({
        code: "ai_timeout",
        status: 504,
        message: "timeout",
      }),
    );

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );
    await waitFor(() => expect(result.current.phase).toBe("active"));

    act(() => result.current.callbacks.sendTurn("hi"));

    await waitFor(() =>
      expect(result.current.errorSurface?.kind).toBe("retry_row"),
    );
    expect(result.current.phase).toBe("error_send");
    const cached = queryClient.getQueryData<InterviewState>(
      aiInterviewQueryKeys.state(APPLICATION_ID),
    );
    expect(cached).toEqual(seeded);
  });

  it("retrySend resends the previously failed message", async () => {
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient, {
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 2,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    vi.mocked(postInterviewTurn)
      .mockRejectedValueOnce(
        new InterviewClientError({
          code: "ai_provider_busy",
          status: 503,
          message: "busy",
        }),
      )
      .mockResolvedValueOnce(turnOk());

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );
    await waitFor(() => expect(result.current.phase).toBe("active"));

    act(() => result.current.callbacks.sendTurn("retry me"));
    await waitFor(() =>
      expect(result.current.errorSurface?.kind).toBe("retry_row"),
    );

    act(() => result.current.callbacks.retrySend());

    await waitFor(() => expect(postInterviewTurn).toHaveBeenCalledTimes(2));
    expect(postInterviewTurn).toHaveBeenLastCalledWith(APPLICATION_ID, {
      message: "retry me",
      expectedCurrentTurn: 2,
    });
  });

  it("shows conflict notice on turn_conflict and clears it on next success", async () => {
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient, {
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 1,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    vi.mocked(postInterviewTurn)
      .mockRejectedValueOnce(new InterviewTurnConflictError(3, "in_progress"))
      .mockResolvedValueOnce(turnOk());

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );
    await waitFor(() => expect(result.current.phase).toBe("active"));

    act(() => result.current.callbacks.sendTurn("stale"));
    await waitFor(() => expect(result.current.showConflictNotice).toBe(true));

    act(() => result.current.callbacks.sendTurn("fresh"));
    await waitFor(() => expect(result.current.showConflictNotice).toBe(false));
  });

  it("maps content-filtered responses to a system_bubble surface (no retry row)", async () => {
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient, {
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 1,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    vi.mocked(postInterviewTurn).mockRejectedValueOnce(
      new InterviewClientError({
        code: "ai_content_filtered",
        status: 422,
        message: "filtered",
      }),
    );

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );
    await waitFor(() => expect(result.current.phase).toBe("active"));

    act(() => result.current.callbacks.sendTurn("oops"));
    await waitFor(() =>
      expect(result.current.errorSurface?.kind).toBe("system_bubble"),
    );
  });

  it("maps monthly cap exceeded to a blocking_banner surface", async () => {
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient, {
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 1,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    vi.mocked(postInterviewTurn).mockRejectedValueOnce(
      new InterviewClientError({
        code: "ai_monthly_cap_exceeded",
        status: 403,
        message: "cap",
      }),
    );

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );
    await waitFor(() => expect(result.current.phase).toBe("active"));

    act(() => result.current.callbacks.sendTurn("hi"));
    await waitFor(() =>
      expect(result.current.errorSurface?.kind).toBe("blocking_banner"),
    );
  });

  it("fires a toast for unknown 5xx fallback errors", async () => {
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient, {
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 1,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    vi.mocked(postInterviewTurn).mockRejectedValueOnce(
      new InterviewClientError({
        code: "internal_server_error",
        status: 500,
        message: "Boom",
      }),
    );

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );
    await waitFor(() => expect(result.current.phase).toBe("active"));

    act(() => result.current.callbacks.sendTurn("hi"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(result.current.errorSurface?.kind).toBe("toast_fallback");
  });

  it("happy-path finish: chains /complete + /generate-summary and ends in finished phase", async () => {
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient, {
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 9,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    vi.mocked(postInterviewComplete).mockResolvedValueOnce({
      status: "completed",
      summaryStatus: "pending",
      currentTurn: 9,
      completedBy: "u1",
      completedAt: "2026-05-29T00:00:00.000Z",
    });
    vi.mocked(postInterviewGenerateSummary).mockResolvedValueOnce({
      status: "completed",
      summaryStatus: "ready",
      contextSummary: "# Summary",
      aiEnabled: true,
    });

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );
    await waitFor(() => expect(result.current.phase).toBe("active"));

    act(() => result.current.callbacks.finishInterview());

    await waitFor(() => expect(result.current.phase).toBe("finished"));
    expect(postInterviewComplete).toHaveBeenCalledWith(APPLICATION_ID, {
      expectedCurrentTurn: 9,
    });
    expect(postInterviewGenerateSummary).toHaveBeenCalled();
  });

  it("missing-topics on /complete renders the missing_topics surface", async () => {
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient, {
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 5,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    vi.mocked(postInterviewComplete).mockRejectedValueOnce(
      new InterviewClientError({
        code: "interview_checklist_incomplete",
        status: 422,
        message: "missing",
        missing: ["preferred_tone"],
      }),
    );

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );
    await waitFor(() => expect(result.current.phase).toBe("active"));

    act(() => result.current.callbacks.finishInterview());

    await waitFor(() =>
      expect(result.current.errorSurface?.kind).toBe("missing_topics"),
    );
    expect(postInterviewGenerateSummary).not.toHaveBeenCalled();
  });

  it("summary failure after a successful /complete renders the full_page_error surface", async () => {
    const { queryClient, wrapper } = createWrapper();
    seed(queryClient, {
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 9,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    vi.mocked(postInterviewComplete).mockResolvedValueOnce({
      status: "completed",
      summaryStatus: "pending",
      currentTurn: 9,
      completedBy: "u1",
      completedAt: "2026-05-29T00:00:00.000Z",
    });
    vi.mocked(postInterviewGenerateSummary).mockRejectedValueOnce(
      new InterviewClientError({
        code: "summary_generation_failed",
        status: 422,
        message: "broke",
      }),
    );

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );
    await waitFor(() => expect(result.current.phase).toBe("active"));

    act(() => result.current.callbacks.finishInterview());

    await waitFor(() => expect(result.current.phase).toBe("error_summary"));
    expect(result.current.errorSurface?.kind).toBe("full_page_error");
  });

  it("summary_pending_retry: completed row with summaryStatus=failed lands on retry phase, retrySummary calls /generate-summary again", async () => {
    const { queryClient, wrapper } = createWrapper();
    vi.mocked(getInterviewState).mockResolvedValue({
      status: "completed",
      summaryStatus: "failed",
      currentTurn: 9,
      interviewLog: [{ role: "assistant", content: "Hi" }],
      contextSummary: null,
    });
    seed(queryClient, {
      status: "completed",
      summaryStatus: "failed",
      currentTurn: 9,
      interviewLog: [{ role: "assistant", content: "Hi" }],
      contextSummary: null,
    });

    vi.mocked(postInterviewGenerateSummary).mockResolvedValueOnce({
      status: "completed",
      summaryStatus: "ready",
      contextSummary: "# OK",
      aiEnabled: true,
    });

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );

    await waitFor(() =>
      expect(result.current.phase).toBe("summary_pending_retry"),
    );

    act(() => result.current.callbacks.retrySummary());

    await waitFor(() => expect(result.current.phase).toBe("finished"));
    expect(postInterviewGenerateSummary).toHaveBeenCalledTimes(1);
    expect(postInterviewComplete).not.toHaveBeenCalled();
  });

  it("displays turn as currentTurn+1 while active and as raw value at the cap", async () => {
    const { queryClient, wrapper } = createWrapper();
    vi.mocked(getInterviewState).mockResolvedValue({
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 4,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });
    seed(queryClient, {
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 4,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );

    await waitFor(() => expect(result.current.phase).toBe("active"));
    expect(result.current.progress.currentTurn).toBe(4);
    expect(result.current.progress.displayTurn).toBe(5);
  });

  it("flags atTurnCap when currentTurn reaches the hard cap", async () => {
    const { queryClient, wrapper } = createWrapper();
    vi.mocked(getInterviewState).mockResolvedValue({
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 15,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });
    seed(queryClient, {
      status: "in_progress",
      summaryStatus: "none",
      currentTurn: 15,
      interviewLog: [{ role: "assistant", content: "Hi" }],
    });

    const { result } = renderHook(
      () => useInterviewController(APPLICATION_ID),
      { wrapper },
    );

    await waitFor(() => expect(result.current.phase).toBe("active"));
    expect(result.current.progress.atTurnCap).toBe(true);
    expect(result.current.progress.displayTurn).toBe(15);
  });
});
