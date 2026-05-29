import type { AiInterviewStatus } from "../types/aiInterview.types";

export const AI_INTERVIEW_STATUS_LABEL: Record<AiInterviewStatus, string> = {
  not_started: "Not configured",
  in_progress: "In progress",
  completed: "Completed",
};

export const AI_INTERVIEW_ACTION_LABEL: Record<AiInterviewStatus, string> = {
  not_started: "Configure AI",
  in_progress: "Continue interview",
  completed: "View AI context",
};

export type AiInterviewRoute =
  | "/applications/$applicationId/ai-interview"
  | "/applications/$applicationId/ai-context";

export function getAiInterviewRoute(
  status: AiInterviewStatus,
): AiInterviewRoute {
  return status === "completed"
    ? "/applications/$applicationId/ai-context"
    : "/applications/$applicationId/ai-interview";
}
