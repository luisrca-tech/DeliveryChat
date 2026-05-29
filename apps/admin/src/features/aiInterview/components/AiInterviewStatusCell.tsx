import type { AiInterviewStatus } from "../types/aiInterview.types";
import { AI_INTERVIEW_STATUS_LABEL } from "../lib/aiInterviewNavigation";

export type AiInterviewStatusCellProps = {
  status: AiInterviewStatus;
};

const STATUS_PILL_CLASS: Record<AiInterviewStatus, string> = {
  not_started:
    "bg-muted text-muted-foreground border border-border/60",
  in_progress: "bg-amber-100 text-amber-900 border border-amber-200",
  completed: "bg-emerald-100 text-emerald-900 border border-emerald-200",
};

export function AiInterviewStatusCell({ status }: AiInterviewStatusCellProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL_CLASS[status]}`}
      data-status={status}
    >
      {AI_INTERVIEW_STATUS_LABEL[status]}
    </span>
  );
}
