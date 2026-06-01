import { useCallback, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { ConfirmDialog } from "@repo/ui/components/ui/confirm-dialog";
import { MarkdownView } from "@repo/ui/components/ui/markdown-view";
import {
  useInterviewStateQuery,
  useRegenerateSummaryMutation,
} from "../hooks/useInterviewState";
import { formatCompletedAt } from "../lib/formatCompletedAt";
import {
  mapInterviewErrorToSurface,
  type InterviewErrorSurface,
} from "../lib/interviewErrorMapper";
import { InterviewErrorBoundary } from "./InterviewErrorBoundary";

export type AiContextPageProps = {
  applicationId: string;
};

const SUMMARY_FAILED_SURFACE: InterviewErrorSurface = {
  kind: "full_page_error",
  code: "summary_generation_failed",
  title: "The previous summary generation failed.",
  detail:
    "Regenerate the summary from your interview transcript to recover.",
  retryLabel: "Regenerate summary",
};

export function AiContextPage({ applicationId }: AiContextPageProps) {
  const { data, isLoading, isError } = useInterviewStateQuery(applicationId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [regenerateSurface, setRegenerateSurface] =
    useState<InterviewErrorSurface | null>(null);

  const handleRegenerateError = useCallback((error: unknown) => {
    const surface = mapInterviewErrorToSurface(error);
    if (!surface) return;
    if (surface.kind === "toast_fallback") {
      toast.error(`${surface.message} (code: ${surface.code})`);
      return;
    }
    setRegenerateSurface(surface);
  }, []);

  const regenerate = useRegenerateSummaryMutation(applicationId, {
    onError: handleRegenerateError,
  });

  const triggerRegenerate = useCallback(() => {
    setRegenerateSurface(null);
    regenerate.mutate();
  }, [regenerate]);

  const handleConfirmRegenerate = useCallback(() => {
    setConfirmOpen(false);
    triggerRegenerate();
  }, [triggerRegenerate]);

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading AI context...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6 text-sm text-destructive">
        Unable to load the AI context.
      </div>
    );
  }

  if (data.status !== "completed") {
    return (
      <Navigate
        to="/applications/$applicationId/ai-interview"
        params={{ applicationId }}
        replace
      />
    );
  }

  const completer = data.completedByName ?? "an admin";
  const completedAtLabel = formatCompletedAt(data.completedAt);

  const activeSurface =
    regenerateSurface ??
    (data.summaryStatus === "failed" && !regenerate.isPending
      ? SUMMARY_FAILED_SURFACE
      : null);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 md:flex-row md:items-start 2xl:max-w-7xl">
      <Card className="w-full md:flex-1">
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1">
            <CardTitle className="text-lg">AI context summary</CardTitle>
            <p className="text-xs text-muted-foreground">
              Completed by <span className="font-medium">{completer}</span>
              {completedAtLabel ? ` on ${completedAtLabel}` : ""}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={regenerate.isPending}
            data-testid="ai-context-regenerate-button"
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Regenerate summary
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <InterviewErrorBoundary
            surface={activeSurface}
            onRetrySummary={triggerRegenerate}
          />
          {regenerate.isPending ? (
            <div
              role="status"
              data-testid="ai-context-summary-skeleton"
              className="flex flex-col gap-2"
            >
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <span className="sr-only">Regenerating summary…</span>
            </div>
          ) : data.contextSummary ? (
            <MarkdownView source={data.contextSummary} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No summary is available for this application yet.
            </p>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Regenerate AI context summary?"
        description="This replaces the current summary with a freshly generated one from your interview transcript. The interview log is preserved."
        confirmLabel="Regenerate"
        cancelLabel="Cancel"
        onConfirm={handleConfirmRegenerate}
        isLoading={regenerate.isPending}
      />
      <Card className="w-full md:w-[22rem] md:shrink-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Interview transcript
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data.interviewLog.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No transcript available.
            </p>
          ) : (
            data.interviewLog.map((entry, index) => (
              <div
                key={`${entry.role}-${index}`}
                className="flex flex-col gap-1"
              >
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {entry.role === "assistant" ? "Interviewer" : "You"}
                </span>
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                  {entry.content}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
