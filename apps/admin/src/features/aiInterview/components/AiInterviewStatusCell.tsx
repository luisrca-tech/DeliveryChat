import { Link } from "@tanstack/react-router";
import { Button } from "@repo/ui/components/ui/button";
import type { AiInterviewStatus } from "../types/aiInterview.types";

export type AiInterviewStatusCellProps = {
  applicationId: string;
  status: AiInterviewStatus;
};

const STATUS_LABEL: Record<AiInterviewStatus, string> = {
  not_started: "Not configured",
  in_progress: "In progress",
  completed: "Completed",
};

const STATUS_ACTION: Record<AiInterviewStatus, string> = {
  not_started: "Configure AI",
  in_progress: "Continue interview",
  completed: "View AI context",
};

const STATUS_PILL_CLASS: Record<AiInterviewStatus, string> = {
  not_started:
    "bg-muted text-muted-foreground border border-border/60",
  in_progress: "bg-amber-100 text-amber-900 border border-amber-200",
  completed: "bg-emerald-100 text-emerald-900 border border-emerald-200",
};

export function AiInterviewStatusCell({
  applicationId,
  status,
}: AiInterviewStatusCellProps) {
  const target =
    status === "completed"
      ? `/applications/${applicationId}/ai-context`
      : `/applications/${applicationId}/ai-interview`;

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL_CLASS[status]}`}
        data-status={status}
      >
        {STATUS_LABEL[status]}
      </span>
      <Link to={target}>
        <Button variant="link" size="sm" className="h-auto p-0 text-sm">
          {STATUS_ACTION[status]}
        </Button>
      </Link>
    </div>
  );
}
