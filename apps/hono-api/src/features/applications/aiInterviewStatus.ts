export type AiInterviewStatus = "not_started" | "in_progress" | "completed";

export type AiContextStatus = "in_progress" | "completed";

export function deriveAiInterviewStatus(
  contextStatus: AiContextStatus | null,
): AiInterviewStatus {
  return contextStatus ?? "not_started";
}
