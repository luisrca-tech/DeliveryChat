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
