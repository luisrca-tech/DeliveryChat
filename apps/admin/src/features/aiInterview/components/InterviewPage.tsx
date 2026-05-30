import { Navigate } from "@tanstack/react-router";
import { Button } from "@repo/ui/components/ui/button";
import { useInterviewController } from "../hooks/useInterviewController";
import { InterviewChatScrollback } from "./InterviewChatScrollback";
import { InterviewComposer } from "./InterviewComposer";
import { InterviewIntroCard } from "./InterviewIntroCard";
import { InterviewProgressChip } from "./InterviewProgressChip";

export type InterviewPageProps = {
  applicationId: string;
};

export function InterviewPage({ applicationId }: InterviewPageProps) {
  const controller = useInterviewController(applicationId);
  const {
    phase,
    turnLog,
    progress,
    errorSurface,
    showConflictNotice,
    isSendingTurn,
    isStartingInterview,
    composer,
    callbacks,
  } = controller;

  if (phase === "loading") {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading interview...
      </div>
    );
  }

  if (phase === "load_error") {
    return (
      <div className="p-6 text-sm text-destructive">
        Unable to load the interview.
      </div>
    );
  }

  if (phase === "intro") {
    return (
      <div className="p-6">
        <InterviewIntroCard
          onStart={callbacks.startInterview}
          isStarting={isStartingInterview}
        />
      </div>
    );
  }

  if (phase === "finished") {
    return (
      <Navigate
        to="/applications/$applicationId/ai-context"
        params={{ applicationId }}
        replace
      />
    );
  }

  if (phase === "finishing" || phase === "summarizing") {
    return (
      <div
        role="status"
        data-testid="interview-generating-state"
        className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground"
      >
        <span className="inline-flex gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-current" />
        </span>
        <p className="font-medium">Generating your AI context…</p>
        <p className="text-xs">This usually takes a few seconds.</p>
      </div>
    );
  }

  if (
    phase === "error_summary" &&
    errorSurface?.kind === "full_page_error" &&
    errorSurface.code === "summary_generation_failed"
  ) {
    return (
      <div
        role="alert"
        data-testid="interview-summary-error"
        className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 p-6"
      >
        <h2 className="text-lg font-semibold text-destructive">
          {errorSurface.title}
        </h2>
        <p className="text-sm text-muted-foreground">{errorSurface.detail}</p>
        <Button type="button" onClick={callbacks.retrySummary}>
          {errorSurface.retryLabel}
        </Button>
      </div>
    );
  }

  if (phase === "summary_pending_retry") {
    return (
      <div
        role="alert"
        data-testid="interview-summary-pending-retry"
        className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 p-6"
      >
        <h2 className="text-lg font-semibold text-destructive">
          We could not generate the AI context.
        </h2>
        <p className="text-sm text-muted-foreground">
          Your interview was saved, but the summary step failed. You can retry
          without losing your answers.
        </p>
        <Button type="button" onClick={callbacks.retrySummary}>
          Retry generation
        </Button>
      </div>
    );
  }

  const capExceeded = errorSurface?.kind === "blocking_banner";
  const retrySurface =
    errorSurface?.kind === "retry_row" ? errorSurface : null;
  const systemBubbleSurface =
    errorSurface?.kind === "system_bubble" ? errorSurface : null;
  const missingTopicsSurface =
    errorSurface?.kind === "missing_topics" ? errorSurface : null;

  const showFinishCta = (progress.canFinish || progress.atTurnCap) && !capExceeded;
  const inputLocked = progress.atTurnCap;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        {progress.showResumePill ? (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Resumed from turn {progress.resumedFromTurn}
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <InterviewProgressChip currentTurn={progress.currentTurn} />
          {showFinishCta ? (
            <Button
              type="button"
              size="sm"
              onClick={callbacks.finishInterview}
              data-testid="interview-finish-cta-header"
            >
              Finish interview
            </Button>
          ) : null}
        </div>
      </div>
      {showConflictNotice ? (
        <div
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
        >
          Interview updated in another session. The latest turns have been
          loaded.
        </div>
      ) : null}
      <InterviewChatScrollback
        log={turnLog}
        showThinkingIndicator={isSendingTurn}
      />
      {showFinishCta ? (
        <div
          data-testid="interview-finish-cta-bubble"
          className="max-w-[80%] self-start rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm"
        >
          <p className="mb-2">
            We have enough context to generate your AI guide. Ready to finish?
          </p>
          <Button type="button" size="sm" onClick={callbacks.finishInterview}>
            Finish interview
          </Button>
        </div>
      ) : null}
      {missingTopicsSurface ? (
        <div
          role="status"
          data-testid="interview-missing-topics"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
        >
          <p className="font-medium">{missingTopicsSurface.title}</p>
          {missingTopicsSurface.missingLabels.length > 0 ? (
            <ul className="mt-1 list-disc pl-4">
              {missingTopicsSurface.missingLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1">{missingTopicsSurface.detail}</p>
          )}
        </div>
      ) : null}
      {systemBubbleSurface ? (
        <div
          role="status"
          data-testid="interview-system-bubble"
          data-code={systemBubbleSurface.code}
          className="max-w-[80%] self-start rounded-lg border border-dashed border-muted-foreground/40 bg-muted px-3 py-2 text-sm text-muted-foreground"
        >
          {systemBubbleSurface.message}
        </div>
      ) : null}
      {retrySurface ? (
        <div
          role="alert"
          data-testid="interview-retry-row"
          data-code={retrySurface.code}
          className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
        >
          <div className="flex flex-col">
            <span className="font-medium">{retrySurface.title}</span>
            <span>{retrySurface.detail}</span>
          </div>
          <button
            type="button"
            onClick={callbacks.retrySend}
            disabled={isSendingTurn}
            className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 shadow-sm hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          >
            {retrySurface.retryLabel}
          </button>
        </div>
      ) : null}
      {capExceeded && errorSurface ? (
        <div
          role="alert"
          data-testid="interview-cap-banner"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <div className="font-semibold">{errorSurface.title}</div>
          <div className="mt-1 text-xs">{errorSurface.detail}</div>
        </div>
      ) : inputLocked ? (
        <div
          data-testid="interview-input-locked"
          className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
        >
          You have reached the {progress.maxTurns}-turn limit. Click
          “Finish interview” to generate your AI context.
        </div>
      ) : (
        <InterviewComposer
          isSending={composer.isSending}
          sendDidFail={composer.sendDidFail}
          onSubmit={composer.onSubmit}
          acknowledgeFailure={composer.acknowledgeFailure}
        />
      )}
    </div>
  );
}
