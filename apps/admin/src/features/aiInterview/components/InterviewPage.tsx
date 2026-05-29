import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  useBootstrapInterviewMutation,
  useInterviewStateQuery,
  useSendInterviewTurnMutation,
} from "../hooks/useInterviewState";
import {
  mapInterviewErrorToSurface,
  type InterviewErrorSurface,
} from "../lib/interviewErrorMapper";
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
        <InterviewProgressChip currentTurn={data.currentTurn} />
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
      ) : (
        <InterviewComposer mutation={sendTurn} />
      )}
    </div>
  );
}
