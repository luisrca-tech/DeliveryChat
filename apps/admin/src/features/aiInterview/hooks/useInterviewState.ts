import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getInterviewState,
  postInterviewTurn,
} from "../lib/aiInterview.client";
import type {
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

export function useBootstrapInterviewMutation(applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      postInterviewTurn(applicationId, { message: "" }),
    onSuccess: (data: InterviewTurnResponse) => {
      const next: InterviewState = {
        status: data.status,
        currentTurn: data.currentTurn,
        interviewLog: data.interviewLog,
      };
      queryClient.setQueryData(
        aiInterviewQueryKeys.state(applicationId),
        next,
      );
    },
  });
}

type SendTurnContext = { previous: InterviewState | undefined };

export function useSendInterviewTurnMutation(applicationId: string) {
  const queryClient = useQueryClient();
  const queryKey = aiInterviewQueryKeys.state(applicationId);

  return useMutation<
    InterviewTurnResponse,
    Error,
    { message: string },
    SendTurnContext
  >({
    mutationFn: ({ message }) =>
      postInterviewTurn(applicationId, { message }),
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

      const optimistic: InterviewState = {
        status: "in_progress",
        currentTurn: previousTurn,
        interviewLog: [...previousLog, { role: "user", content: message }],
      };
      queryClient.setQueryData(queryKey, optimistic);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context) queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: (data) => {
      const next: InterviewState = {
        status: data.status,
        currentTurn: data.currentTurn,
        interviewLog: data.interviewLog,
      };
      queryClient.setQueryData(queryKey, next);
    },
  });
}
