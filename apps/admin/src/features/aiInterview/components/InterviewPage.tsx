import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import {
  useBootstrapInterviewMutation,
  useFinishInterviewMutation,
  useInterviewStateQuery,
  useRetrySummaryGenerationMutation,
  useSendInterviewTurnMutation,
} from "../hooks/useInterviewState";
import {
  mapInterviewErrorToSurface,
  type InterviewErrorSurface,
} from "../lib/interviewErrorMapper";
import { INTERVIEW_MAX_TURNS } from "../lib/interviewProgress";
import { InterviewChatScrollback } from "./InterviewChatScrollback";
import { InterviewComposer } from "./InterviewComposer";
import { InterviewIntroCard } from "./InterviewIntroCard";
import { InterviewProgressChip } from "./InterviewProgressChip";

export type InterviewPageProps = {
  applicationId: string;
};

export function InterviewPage({ applicationId }: InterviewPageProps) {
  const { data, isLoading, isError } = useInterviewStateQuery(applicationId);
  const bootstrap = useBootstrapInterviewMutation(applicationId);
  const [showConflictNotice, setShowConflictNotice] = useState(false);
  const [errorSurface, setErrorSurface] =
    useState<InterviewErrorSurface | null>(null);
  const [finishErrorSurface, setFinishErrorSurface] =
    useState<InterviewErrorSurface | null>(null);
  const [canFinish, setCanFinish] = useState(false);
  const lastFailedMessageRef = useRef<string | null>(null);

  const handleConflict = useCallback(() => setShowConflictNotice(true), []);
  const handleSendError = useCallback(
    (error: unknown, failedMessage: string) => {
      const surface = mapInterviewErrorToSurface(error);
      if (!surface) return;
      lastFailedMessageRef.current = failedMessage;
      setErrorSurface(surface);
      if (surface.kind === "toast_fallback") {
        toast.error(`${surface.message} (code: ${surface.code})`);
      }
    },
    [],
  );

  const sendTurn = useSendInterviewTurnMutation(applicationId, {
    onTurnConflict: handleConflict,
    onSendError: handleSendError,
  });

  useEffect(() => {
    if (sendTurn.isSuccess && sendTurn.data) {
      setCanFinish(sendTurn.data.canFinish);
    }
  }, [sendTurn.isSuccess, sendTurn.data]);

  useEffect(() => {
    if (bootstrap.isSuccess && bootstrap.data) {
      setCanFinish(bootstrap.data.canFinish);
    }
  }, [bootstrap.isSuccess, bootstrap.data]);

  const handleCompleteError = useCallback((error: unknown) => {
    const surface = mapInterviewErrorToSurface(error);
    if (!surface) return;
    setFinishErrorSurface(surface);
    if (surface.kind === "toast_fallback") {
      toast.error(`${surface.message} (code: ${surface.code})`);
    }
  }, []);

  const handleSummaryError = useCallback((error: unknown) => {
    const surface = mapInterviewErrorToSurface(error);
    if (!surface) return;
    setFinishErrorSurface(surface);
    if (surface.kind === "toast_fallback") {
      toast.error(`${surface.message} (code: ${surface.code})`);
    }
  }, []);

  const finish = useFinishInterviewMutation(applicationId, {
    onCompleteError: handleCompleteError,
    onSummaryError: handleSummaryError,
  });

  const retrySummary = useRetrySummaryGenerationMutation(applicationId, {
    onError: handleSummaryError,
  });

  const handleFinishClick = useCallback(() => {
    setFinishErrorSurface(null);
    finish.mutate();
  }, [finish]);

  const handleRetrySummary = useCallback(() => {
    setFinishErrorSurface(null);
    retrySummary.mutate();
  }, [retrySummary]);

  const resumeTurnRef = useRef<number | null>(null);

  useEffect(() => {
    if (sendTurn.isSuccess && showConflictNotice) {
      setShowConflictNotice(false);
    }
    if (sendTurn.isSuccess && errorSurface) {
      setErrorSurface(null);
      lastFailedMessageRef.current = null;
    }
  }, [sendTurn.isSuccess, showConflictNotice, errorSurface]);

  const handleRetry = useCallback(() => {
    const message = lastFailedMessageRef.current;
    if (!message) return;
    setErrorSurface(null);
    sendTurn.mutate({ message });
  }, [sendTurn]);

  if (isLoading) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Loading interview...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-6 text-sm text-destructive">
        Unable to load the interview.
      </div>
    );
  }

  if (data.status === "completed" && !finish.isPending && !retrySummary.isPending) {
    return (
      <Navigate
        to="/applications/$applicationId/ai-context"
        params={{ applicationId }}
        replace
      />
    );
  }

  if (data.status === "not_started") {
    return (
      <div className="p-6">
        <InterviewIntroCard
          onStart={() => bootstrap.mutate()}
          isStarting={bootstrap.isPending}
        />
      </div>
    );
  }

  const isGenerating = finish.isPending || retrySummary.isPending;

  if (isGenerating) {
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
    finishErrorSurface?.kind === "full_page_error" &&
    finishErrorSurface.code === "summary_generation_failed"
  ) {
    return (
      <div
        role="alert"
        data-testid="interview-summary-error"
        className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 p-6"
      >
        <h2 className="text-lg font-semibold text-destructive">
          {finishErrorSurface.title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {finishErrorSurface.detail}
        </p>
        <Button type="button" onClick={handleRetrySummary}>
          {finishErrorSurface.retryLabel}
        </Button>
      </div>
    );
  }

  if (resumeTurnRef.current === null && data.currentTurn > 0) {
    resumeTurnRef.current = data.currentTurn;
  }
  const showResumePill =
    resumeTurnRef.current !== null && resumeTurnRef.current > 0;

  const capExceeded = errorSurface?.kind === "blocking_banner";
  const retrySurface =
    errorSurface?.kind === "retry_row" ? errorSurface : null;
  const systemBubbleSurface =
    errorSurface?.kind === "system_bubble" ? errorSurface : null;

  const atTurnCap = data.currentTurn >= INTERVIEW_MAX_TURNS;
  const showFinishCta = (canFinish || atTurnCap) && !capExceeded;
  const inputLocked = atTurnCap;
  const missingTopicsSurface =
    finishErrorSurface?.kind === "missing_topics"
      ? finishErrorSurface
      : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <div className="flex items-start justify-between gap-4">
        {showResumePill ? (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Resumed from turn {resumeTurnRef.current}
          </span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <InterviewProgressChip currentTurn={data.currentTurn} />
          {showFinishCta ? (
            <Button
              type="button"
              size="sm"
              onClick={handleFinishClick}
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
        log={data.interviewLog}
        showThinkingIndicator={sendTurn.isPending}
      />
      {showFinishCta ? (
        <div
          data-testid="interview-finish-cta-bubble"
          className="max-w-[80%] self-start rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm"
        >
          <p className="mb-2">
            We have enough context to generate your AI guide. Ready to finish?
          </p>
          <Button type="button" size="sm" onClick={handleFinishClick}>
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
            onClick={handleRetry}
            disabled={sendTurn.isPending}
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
          You have reached the {INTERVIEW_MAX_TURNS}-turn limit. Click
          “Finish interview” to generate your AI context.
        </div>
      ) : (
        <InterviewComposer mutation={sendTurn} />
      )}
    </div>
  );
}
