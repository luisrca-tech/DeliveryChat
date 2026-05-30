import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  mapInterviewErrorToSurface,
  type InterviewErrorSurface,
} from "../lib/interviewErrorMapper";
import {
  INTERVIEW_MAX_TURNS,
  progressToneForTurn,
  type ProgressTone,
} from "../lib/interviewProgress";
import type {
  InterviewLogEntry,
  InterviewState,
  InterviewSummaryStatus,
} from "../types/aiInterview.types";
import {
  useBootstrapInterviewMutation,
  useFinishInterviewMutation,
  useInterviewStateQuery,
  useRetrySummaryGenerationMutation,
  useSendInterviewTurnMutation,
} from "./useInterviewState";

export type InterviewPhase =
  | "loading"
  | "load_error"
  | "intro"
  | "active"
  | "finishing"
  | "summarizing"
  | "finished"
  | "summary_pending_retry"
  | "error_send"
  | "error_complete"
  | "error_summary";

export type InterviewProgress = {
  currentTurn: number;
  maxTurns: number;
  tone: ProgressTone;
  atTurnCap: boolean;
  canFinish: boolean;
  showResumePill: boolean;
  resumedFromTurn: number | null;
};

export type InterviewControllerCallbacks = {
  startInterview: () => void;
  sendTurn: (message: string) => void;
  finishInterview: () => void;
  retrySend: () => void;
  retrySummary: () => void;
  dismissConflictNotice: () => void;
};

export type InterviewComposerBinding = {
  isSending: boolean;
  sendDidFail: boolean;
  onSubmit: (message: string) => void;
  acknowledgeFailure: () => void;
};

export type InterviewControllerState = {
  phase: InterviewPhase;
  turnLog: InterviewLogEntry[];
  progress: InterviewProgress;
  errorSurface: InterviewErrorSurface | null;
  showConflictNotice: boolean;
  isSendingTurn: boolean;
  isStartingInterview: boolean;
  isCapExceeded: boolean;
  summaryStatus: InterviewSummaryStatus;
  composer: InterviewComposerBinding;
  callbacks: InterviewControllerCallbacks;
};

const SUMMARY_PENDING_RETRY_SURFACE: InterviewErrorSurface = {
  kind: "full_page_error",
  code: "summary_generation_failed",
  title: "We could not generate the AI context.",
  detail:
    "Your interview was saved, but the summary step failed. You can retry without losing your answers.",
  retryLabel: "Retry generation",
};

function fireToastIfFallback(surface: InterviewErrorSurface | null) {
  if (surface && surface.kind === "toast_fallback") {
    toast.error(`${surface.message} (code: ${surface.code})`);
  }
}

function extractActive(data: InterviewState | undefined): {
  currentTurn: number;
  log: InterviewLogEntry[];
  summaryStatus: InterviewSummaryStatus;
  isCompleted: boolean;
} {
  if (!data || data.status === "not_started") {
    return {
      currentTurn: 0,
      log: [],
      summaryStatus: "none",
      isCompleted: false,
    };
  }
  return {
    currentTurn: data.currentTurn,
    log: data.interviewLog,
    summaryStatus: data.summaryStatus,
    isCompleted: data.status === "completed",
  };
}

export function useInterviewController(
  applicationId: string,
): InterviewControllerState {
  const { data, isLoading, isError } = useInterviewStateQuery(applicationId);

  const [sendErrorSurface, setSendErrorSurface] =
    useState<InterviewErrorSurface | null>(null);
  const [finishErrorSurface, setFinishErrorSurface] =
    useState<InterviewErrorSurface | null>(null);
  const [showConflictNotice, setShowConflictNotice] = useState(false);

  const lastFailedMessageRef = useRef<string | null>(null);
  const resumeTurnRef = useRef<number | null>(null);

  const handleSendError = useCallback(
    (error: unknown, failedMessage: string) => {
      const surface = mapInterviewErrorToSurface(error);
      if (!surface) return;
      lastFailedMessageRef.current = failedMessage;
      setSendErrorSurface(surface);
      fireToastIfFallback(surface);
    },
    [],
  );

  const handleConflict = useCallback(() => {
    setShowConflictNotice(true);
  }, []);

  const bootstrap = useBootstrapInterviewMutation(applicationId);
  const sendTurn = useSendInterviewTurnMutation(applicationId, {
    onTurnConflict: handleConflict,
    onSendError: handleSendError,
  });

  const handleCompleteError = useCallback((error: unknown) => {
    const surface = mapInterviewErrorToSurface(error);
    if (!surface) return;
    setFinishErrorSurface(surface);
    fireToastIfFallback(surface);
  }, []);

  const handleSummaryError = useCallback((error: unknown) => {
    const surface = mapInterviewErrorToSurface(error);
    if (!surface) return;
    setFinishErrorSurface(surface);
    fireToastIfFallback(surface);
  }, []);

  const finish = useFinishInterviewMutation(applicationId, {
    onCompleteError: handleCompleteError,
    onSummaryError: handleSummaryError,
  });

  const retrySummary = useRetrySummaryGenerationMutation(applicationId, {
    onError: handleSummaryError,
  });

  const active = extractActive(data);

  if (resumeTurnRef.current === null && active.currentTurn > 0) {
    resumeTurnRef.current = active.currentTurn;
  }

  const startInterview = useCallback(() => {
    bootstrap.mutate();
  }, [bootstrap]);

  const doSendTurn = useCallback(
    (message: string) => {
      setSendErrorSurface(null);
      setShowConflictNotice(false);
      sendTurn.mutate({ message });
    },
    [sendTurn],
  );

  const finishInterview = useCallback(() => {
    setFinishErrorSurface(null);
    finish.mutate();
  }, [finish]);

  const retrySend = useCallback(() => {
    const message = lastFailedMessageRef.current;
    if (!message) return;
    setSendErrorSurface(null);
    sendTurn.mutate({ message });
  }, [sendTurn]);

  const doRetrySummary = useCallback(() => {
    setFinishErrorSurface(null);
    retrySummary.mutate();
  }, [retrySummary]);

  const dismissConflictNotice = useCallback(() => {
    setShowConflictNotice(false);
  }, []);

  const callbacks = useMemo<InterviewControllerCallbacks>(
    () => ({
      startInterview,
      sendTurn: doSendTurn,
      finishInterview,
      retrySend,
      retrySummary: doRetrySummary,
      dismissConflictNotice,
    }),
    [
      startInterview,
      doSendTurn,
      finishInterview,
      retrySend,
      doRetrySummary,
      dismissConflictNotice,
    ],
  );

  const canFinish =
    sendTurn.data?.canFinish ?? bootstrap.data?.canFinish ?? false;

  const sendInFlight = sendTurn.isPending;
  const effectiveSendError =
    sendInFlight || sendTurn.isSuccess ? null : sendErrorSurface;
  const effectiveConflictNotice =
    sendInFlight || sendTurn.isSuccess ? false : showConflictNotice;

  const atTurnCap = active.currentTurn >= INTERVIEW_MAX_TURNS;
  const showResumePill =
    resumeTurnRef.current !== null && resumeTurnRef.current > 0;

  const baseErrorSurface = effectiveSendError ?? finishErrorSurface ?? null;

  const phase: InterviewPhase = (() => {
    if (isLoading) return "loading";
    if (isError || !data) return "load_error";
    if (data.status === "not_started") return "intro";

    if (finish.isPending) return "finishing";
    if (retrySummary.isPending) return "summarizing";

    if (
      finishErrorSurface?.kind === "full_page_error" &&
      finishErrorSurface.code === "summary_generation_failed"
    ) {
      return "error_summary";
    }

    if (data.status === "completed") {
      if (active.summaryStatus === "failed") return "summary_pending_retry";
      return "finished";
    }

    if (finishErrorSurface) return "error_complete";
    if (effectiveSendError) return "error_send";

    return "active";
  })();

  const errorSurface: InterviewErrorSurface | null =
    phase === "summary_pending_retry"
      ? SUMMARY_PENDING_RETRY_SURFACE
      : baseErrorSurface;

  const isCapExceeded = errorSurface?.kind === "blocking_banner";

  const composer: InterviewComposerBinding = {
    isSending: sendInFlight,
    sendDidFail: sendTurn.isError,
    onSubmit: doSendTurn,
    acknowledgeFailure: sendTurn.reset,
  };

  return {
    phase,
    turnLog: active.log,
    progress: {
      currentTurn: active.currentTurn,
      maxTurns: INTERVIEW_MAX_TURNS,
      tone: progressToneForTurn(active.currentTurn),
      atTurnCap,
      canFinish,
      showResumePill,
      resumedFromTurn: resumeTurnRef.current,
    },
    errorSurface,
    showConflictNotice: effectiveConflictNotice,
    isSendingTurn: sendInFlight,
    isStartingInterview: bootstrap.isPending,
    isCapExceeded,
    summaryStatus: active.summaryStatus,
    composer,
    callbacks,
  };
}
