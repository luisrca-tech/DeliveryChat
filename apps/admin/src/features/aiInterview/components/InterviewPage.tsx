import { Navigate } from "@tanstack/react-router";
import { Button } from "@repo/ui/components/ui/button";
import { useInterviewController } from "../hooks/useInterviewController";
import { InterviewChatScrollback } from "./InterviewChatScrollback";
import { InterviewComposer } from "./InterviewComposer";
import { InterviewErrorBoundary } from "./InterviewErrorBoundary";
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
    isCapExceeded,
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

  if (phase === "error_summary" || phase === "summary_pending_retry") {
    return (
      <InterviewErrorBoundary
        surface={errorSurface}
        onRetrySummary={callbacks.retrySummary}
      />
    );
  }

  const showFinishCta = (progress.canFinish || progress.atTurnCap) && !isCapExceeded;
  const inputLocked = progress.atTurnCap;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-start justify-end gap-4">
        <div className="flex items-center gap-3">
          <InterviewProgressChip displayTurn={progress.displayTurn} />
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
      <InterviewErrorBoundary
        surface={errorSurface}
        onRetrySend={callbacks.retrySend}
        isSending={isSendingTurn}
      />
      {isCapExceeded ? null : inputLocked ? (
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
