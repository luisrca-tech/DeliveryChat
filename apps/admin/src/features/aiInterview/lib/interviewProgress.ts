export const INTERVIEW_MAX_TURNS = 15;
export const INTERVIEW_SUGGESTED_MIN = 8;
export const INTERVIEW_SUGGESTED_MAX = 12;

export type ProgressTone = "neutral" | "green" | "amber";

export function progressToneForTurn(currentTurn: number): ProgressTone {
  if (currentTurn >= INTERVIEW_SUGGESTED_MIN && currentTurn <= INTERVIEW_SUGGESTED_MAX) {
    return "green";
  }
  if (currentTurn > INTERVIEW_SUGGESTED_MAX) {
    return "amber";
  }
  return "neutral";
}
