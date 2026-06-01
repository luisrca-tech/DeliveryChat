import { useCallback, useMemo, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { ConfirmDialog } from "@repo/ui/components/ui/confirm-dialog";
import { MarkdownView } from "@repo/ui/components/ui/markdown-view";
import "../styles/interview-theme.css";
import { useApplicationQuery } from "@/features/applications/hooks/useApplicationQuery";
import {
  useInterviewStateQuery,
  useRegenerateSummaryMutation,
} from "../hooks/useInterviewState";
import { formatCompletedAt } from "../lib/formatCompletedAt";
import {
  mapInterviewErrorToSurface,
  type InterviewErrorSurface,
} from "../lib/interviewErrorMapper";
import type { InterviewLogEntry } from "../types/aiInterview.types";
import { InterviewAnswerBlock } from "./InterviewAnswerBlock";
import { InterviewErrorBoundary } from "./InterviewErrorBoundary";
import { InterviewEyebrow } from "./InterviewEyebrow";
import { InterviewQuestionBlock } from "./InterviewQuestionBlock";
import { InterviewTextLink } from "./InterviewTextLink";

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

type TranscriptPair = {
  question: InterviewLogEntry;
  answer?: InterviewLogEntry;
  round: number;
};

function pairTranscript(log: InterviewLogEntry[]): TranscriptPair[] {
  const pairs: TranscriptPair[] = [];
  let round = 0;
  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    if (!entry || entry.role !== "assistant") continue;
    round += 1;
    const next = log[i + 1];
    pairs.push({
      question: entry,
      answer: next?.role === "user" ? next : undefined,
      round,
    });
  }
  return pairs;
}

export function AiContextPage({ applicationId }: AiContextPageProps) {
  const { data, isLoading, isError } = useInterviewStateQuery(applicationId);
  const { data: applicationDetail } = useApplicationQuery(applicationId);
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

  const transcriptPairs = useMemo(
    () =>
      data && data.status !== "not_started"
        ? pairTranscript(data.interviewLog)
        : [],
    [data],
  );

  if (isLoading) {
    return (
      <section
        role="status"
        className="interview-theme flex min-h-[100dvh] w-full items-center justify-center"
      >
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <InterviewEyebrow>AI Context · Loading</InterviewEyebrow>
          <p className="interview-italic text-xl leading-relaxed text-[var(--interview-color-muted)] md:text-2xl">
            Opening the brief…
          </p>
        </div>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section
        role="alert"
        className="interview-theme flex min-h-[100dvh] w-full items-center justify-center"
      >
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <InterviewEyebrow>AI Context · Error</InterviewEyebrow>
          <h1 className="interview-display text-3xl font-medium leading-[1.15] tracking-tight text-[var(--interview-color-foreground)] md:text-4xl">
            Unable to load the AI context.
          </h1>
          <p className="interview-italic max-w-[52ch] text-base leading-relaxed text-[var(--interview-color-muted)]">
            Refresh the page to try again.
          </p>
        </div>
      </section>
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
  const applicationName =
    applicationDetail?.application.name ?? "Application";
  const turnCount = transcriptPairs.length;

  const activeSurface =
    regenerateSurface ??
    (data.summaryStatus === "failed" && !regenerate.isPending
      ? SUMMARY_FAILED_SURFACE
      : null);

  return (
    <div className="interview-theme min-h-[100dvh] w-full">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 md:py-14">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between md:gap-8">
          <div className="flex flex-col gap-3">
            <InterviewEyebrow>
              AI Context · {applicationName}
            </InterviewEyebrow>
            <h1 className="interview-display text-3xl font-medium leading-[1.1] tracking-tight text-[var(--interview-color-foreground)] md:text-5xl">
              Your assistant's brief
            </h1>
            <p className="interview-italic text-base leading-relaxed text-[var(--interview-color-muted)] md:text-lg">
              Completed by {completer}
              {completedAtLabel ? ` on ${completedAtLabel}` : ""}
            </p>
          </div>
          <div className="flex md:pt-2">
            <InterviewTextLink
              onClick={() => setConfirmOpen(true)}
              disabled={regenerate.isPending}
              loading={regenerate.isPending}
              loadingLabel="Rewriting…"
              showArrow={!regenerate.isPending}
              data-testid="ai-context-regenerate-button"
            >
              <span className="inline-flex items-baseline gap-2">
                <RefreshCw
                  aria-hidden="true"
                  className="h-3.5 w-3.5 self-center"
                />
                Regenerate summary
              </span>
            </InterviewTextLink>
          </div>
        </header>

        <div
          aria-hidden="true"
          className="h-px w-full bg-[var(--interview-color-rule)]"
        />

        <div className="flex flex-col gap-10 md:flex-row md:items-start md:gap-12">
          <main className="flex-1 md:min-w-0">
            <InterviewErrorBoundary
              surface={activeSurface}
              onRetrySummary={triggerRegenerate}
            />
            {regenerate.isPending ? (
              <div
                role="status"
                data-testid="ai-context-summary-skeleton"
                className="flex flex-col gap-4"
              >
                <p className="interview-italic text-2xl leading-relaxed text-[var(--interview-color-muted)] md:text-3xl">
                  Rewriting your brief…
                </p>
                <div
                  aria-hidden="true"
                  className="interview-accent-rule-animated"
                />
                <span className="sr-only">Regenerating summary…</span>
              </div>
            ) : data.contextSummary ? (
              <MarkdownView
                source={data.contextSummary}
                className="interview-markdown"
              />
            ) : !activeSurface ? (
              <p className="interview-italic text-base leading-relaxed text-[var(--interview-color-muted)]">
                No summary is available for this application yet.
              </p>
            ) : null}
          </main>

          <div
            aria-hidden="true"
            className="hidden self-stretch w-px bg-[var(--interview-color-rule)] md:block"
          />
          <div
            aria-hidden="true"
            className="h-px w-full bg-[var(--interview-color-rule)] md:hidden"
          />

          <aside className="flex w-full flex-col gap-6 md:w-[22rem] md:shrink-0 md:sticky md:top-10">
            <InterviewEyebrow>
              Interview transcript · {turnCount}{" "}
              {turnCount === 1 ? "turn" : "turns"}
            </InterviewEyebrow>
            {transcriptPairs.length === 0 ? (
              <p className="interview-italic text-sm text-[var(--interview-color-muted)]">
                No transcript available.
              </p>
            ) : (
              <div className="flex flex-col gap-8">
                {transcriptPairs.map((pair, index) => (
                  <div key={index} className="flex flex-col gap-3">
                    <InterviewQuestionBlock
                      topic={pair.question.topicsCoveredThisTurn?.[0]}
                      round={pair.round}
                      intent={pair.question.intent}
                      className="[&_h2]:text-base [&_h2]:md:text-lg [&_h2]:leading-[1.3]"
                    >
                      {pair.question.content}
                    </InterviewQuestionBlock>
                    {pair.answer ? (
                      <InterviewAnswerBlock className="text-sm md:text-sm">
                        {pair.answer.content}
                      </InterviewAnswerBlock>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Replace the current brief?"
        description="This rewrites the brief from your interview transcript. The transcript itself is preserved."
        confirmLabel="Regenerate"
        cancelLabel="Cancel"
        onConfirm={handleConfirmRegenerate}
        isLoading={regenerate.isPending}
      />
    </div>
  );
}
