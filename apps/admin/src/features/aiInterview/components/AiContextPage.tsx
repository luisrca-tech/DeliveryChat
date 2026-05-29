import { useCallback, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/ui/components/ui/collapsible";
import {
  useInterviewStateQuery,
  useRegenerateSummaryMutation,
} from "../hooks/useInterviewState";
import { formatCompletedAt } from "../lib/formatCompletedAt";
import { mapInterviewErrorToSurface } from "../lib/interviewErrorMapper";

export type AiContextPageProps = {
  applicationId: string;
};

export function AiContextPage({ applicationId }: AiContextPageProps) {
  const { data, isLoading, isError } = useInterviewStateQuery(applicationId);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleRegenerateError = useCallback((error: unknown) => {
    const surface = mapInterviewErrorToSurface(error);
    if (!surface) return;
    const message =
      surface.kind === "toast_fallback" || surface.kind === "system_bubble"
        ? surface.message
        : surface.title;
    toast.error(`${message} (code: ${surface.code})`);
  }, []);

  const regenerate = useRegenerateSummaryMutation(applicationId, {
    onError: handleRegenerateError,
  });

  const handleConfirmRegenerate = useCallback(() => {
    setConfirmOpen(false);
    regenerate.mutate();
  }, [regenerate]);

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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6 md:flex-row md:items-start">
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
        <CardContent>
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
        <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen}>
          <CardHeader className="pb-3">
            <CollapsibleTrigger
              className="flex w-full items-center justify-between gap-2 text-left"
              data-testid="ai-context-transcript-toggle"
            >
              <CardTitle className="text-sm font-medium">
                Interview transcript
              </CardTitle>
              {transcriptOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
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
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}
