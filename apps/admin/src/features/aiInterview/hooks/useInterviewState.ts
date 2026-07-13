import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getInterviewState,
  InterviewTurnConflictError,
  postInterviewComplete,
  postInterviewGenerateSummary,
  postInterviewTurn,
} from "../lib/aiInterview.client";
import type {
  InterviewCompleteResponse,
  InterviewGenerateSummaryResponse,
  InterviewState,
  InterviewTurnResponse,
} from "../types/aiInterview.types";

export const aiInterviewQueryKeys = {
  all: () => ["aiInterview"] as const,
  state: (applicationId: string) =>
    [...aiInterviewQueryKeys.all(), "state", applicationId] as const,
};

export function useInterviewStateQuery(applicationId: string) {
  return useQuery({
    queryKey: aiInterviewQueryKeys.state(applicationId),
    queryFn: () => getInterviewState(applicationId),
    enabled: Boolean(applicationId),
    staleTime: 0,
  });
}

function cachedCurrentTurn(state: InterviewState | undefined): number {
  if (!state || state.status === "not_started") return 0;
  return state.currentTurn;
}

export function useBootstrapInterviewMutation(applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      postInterviewTurn(applicationId, {
        message: "",
        expectedCurrentTurn: 0,
      }),
    onSuccess: (data: InterviewTurnResponse) => {
      const previous = queryClient.getQueryData<InterviewState>(
        aiInterviewQueryKeys.state(applicationId),
      );
      const previousSummaryStatus =
        previous && previous.status !== "not_started"
          ? previous.summaryStatus
          : "none";
      const next: InterviewState = {
        status: data.status,
        summaryStatus: previousSummaryStatus,
        currentTurn: data.currentTurn,
        interviewLog: data.interviewLog,
      };
      queryClient.setQueryData(aiInterviewQueryKeys.state(applicationId), next);
    },
  });
}

type SendTurnContext = { previous: InterviewState | undefined };

export type SendInterviewTurnOptions = {
  onTurnConflict?: () => void;
  onSendError?: (error: unknown, failedMessage: string) => void;
};

export function useSendInterviewTurnMutation(
  applicationId: string,
  options: SendInterviewTurnOptions = {},
) {
  const queryClient = useQueryClient();
  const queryKey = aiInterviewQueryKeys.state(applicationId);
  const { onTurnConflict, onSendError } = options;

  return useMutation<
    InterviewTurnResponse,
    Error,
    { message: string },
    SendTurnContext
  >({
    mutationFn: ({ message }) => {
      const current = queryClient.getQueryData<InterviewState>(queryKey);
      return postInterviewTurn(applicationId, {
        message,
        expectedCurrentTurn: cachedCurrentTurn(current),
      });
    },
    onMutate: async ({ message }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InterviewState>(queryKey);

      const previousLog =
        previous && previous.status !== "not_started"
          ? previous.interviewLog
          : [];
      const previousTurn =
        previous && previous.status !== "not_started"
          ? previous.currentTurn
          : 0;
      const previousSummaryStatus =
        previous && previous.status !== "not_started"
          ? previous.summaryStatus
          : "none";

      const optimistic: InterviewState = {
        status: "in_progress",
        summaryStatus: previousSummaryStatus,
        currentTurn: previousTurn,
        interviewLog: [...previousLog, { role: "user", content: message }],
      };
      queryClient.setQueryData(queryKey, optimistic);
      return { previous };
    },
    onError: (err, vars, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous);
      if (err instanceof InterviewTurnConflictError) {
        void queryClient.invalidateQueries({ queryKey });
        onTurnConflict?.();
        return;
      }
      onSendError?.(err, vars.message);
    },
    onSuccess: (data) => {
      const previous = queryClient.getQueryData<InterviewState>(queryKey);
      const previousSummaryStatus =
        previous && previous.status !== "not_started"
          ? previous.summaryStatus
          : "none";
      const next: InterviewState = {
        status: data.status,
        summaryStatus: previousSummaryStatus,
        currentTurn: data.currentTurn,
        interviewLog: data.interviewLog,
      };
      queryClient.setQueryData(queryKey, next);
    },
  });
}

export type FinishInterviewResult = {
  complete: InterviewCompleteResponse;
  summary: InterviewGenerateSummaryResponse;
};

export type FinishInterviewOptions = {
  onCompleteError?: (error: unknown) => void;
  onSummaryError?: (error: unknown) => void;
  onChainSuccess?: (result: FinishInterviewResult) => void;
};

export function useFinishInterviewMutation(
  applicationId: string,
  options: FinishInterviewOptions = {},
) {
  const queryClient = useQueryClient();
  const queryKey = aiInterviewQueryKeys.state(applicationId);
  const { onCompleteError, onSummaryError, onChainSuccess } = options;

  return useMutation<FinishInterviewResult, Error, void>({
    mutationFn: async () => {
      const current = queryClient.getQueryData<InterviewState>(queryKey);
      const expectedCurrentTurn = cachedCurrentTurn(current);

      let complete: InterviewCompleteResponse;
      try {
        complete = await postInterviewComplete(applicationId, {
          expectedCurrentTurn,
        });
      } catch (error) {
        onCompleteError?.(error);
        throw error;
      }

      let summary: InterviewGenerateSummaryResponse;
      try {
        summary = await postInterviewGenerateSummary(applicationId);
      } catch (error) {
        onSummaryError?.(error);
        throw error;
      }

      return { complete, summary };
    },
    onSuccess: (result) => {
      const current = queryClient.getQueryData<InterviewState>(queryKey);
      const previousLog =
        current && current.status !== "not_started" ? current.interviewLog : [];
      const next: InterviewState = {
        status: "completed",
        summaryStatus: result.summary.summaryStatus,
        currentTurn: result.complete.currentTurn,
        interviewLog: previousLog,
        contextSummary: result.summary.contextSummary,
      };
      queryClient.setQueryData(queryKey, next);
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
      onChainSuccess?.(result);
    },
  });
}

type RegenerateContext = { previous: InterviewState | undefined };

export type RegenerateSummaryOptions = {
  onError?: (error: unknown) => void;
};

export function useRegenerateSummaryMutation(
  applicationId: string,
  options: RegenerateSummaryOptions = {},
) {
  const queryClient = useQueryClient();
  const queryKey = aiInterviewQueryKeys.state(applicationId);
  const { onError } = options;

  return useMutation<
    InterviewGenerateSummaryResponse,
    Error,
    void,
    RegenerateContext
  >({
    mutationFn: () => postInterviewGenerateSummary(applicationId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<InterviewState>(queryKey);
      if (previous && previous.status !== "not_started") {
        const optimistic: InterviewState = {
          ...previous,
          contextSummary: null,
        };
        queryClient.setQueryData(queryKey, optimistic);
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous);
      onError?.(error);
    },
    onSuccess: (data) => {
      const current = queryClient.getQueryData<InterviewState>(queryKey);
      if (current && current.status !== "not_started") {
        const next: InterviewState = {
          ...current,
          status: "completed",
          summaryStatus: data.summaryStatus,
          contextSummary: data.contextSummary,
        };
        queryClient.setQueryData(queryKey, next);
      }
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

export function useRetrySummaryGenerationMutation(
  applicationId: string,
  options: { onError?: (error: unknown) => void } = {},
) {
  const queryClient = useQueryClient();
  const queryKey = aiInterviewQueryKeys.state(applicationId);
  const { onError } = options;

  return useMutation<InterviewGenerateSummaryResponse, Error, void>({
    mutationFn: () => postInterviewGenerateSummary(applicationId),
    onError: (error) => onError?.(error),
    onSuccess: (data) => {
      const current = queryClient.getQueryData<InterviewState>(queryKey);
      if (current && current.status !== "not_started") {
        const next: InterviewState = {
          ...current,
          status: "completed",
          summaryStatus: data.summaryStatus,
          contextSummary: data.contextSummary,
        };
        queryClient.setQueryData(queryKey, next);
      }
      void queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}
