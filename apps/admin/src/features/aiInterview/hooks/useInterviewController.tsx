import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { InterviewTurnConflictError } from "../lib/aiInterview.client";
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
  aiInterviewQueryKeys,
  useBootstrapInterviewMutation,
  useFinishInterviewMutation,
  useInterviewStateQuery,
  useRetrySummaryGenerationMutation,
  useSendInterviewTurnMutation,
} from "./useInterviewState";

const TURN_CONFLICT_TOAST_COPY =
  "The interview was updated in another tab or session. We refreshed the latest answers — please try again.";

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
  displayTurn: number;
  maxTurns: number;
  tone: ProgressTone;
  atTurnCap: boolean;
  canFinish: boolean;
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

export type LatestTurnGuardrail = "redirect_scope" | "pushback_garbage";

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
  latestGuardrailAction?: LatestTurnGuardrail;
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
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useInterviewStateQuery(applicationId);

  const [sendErrorSurface, setSendErrorSurface] =
    useState<InterviewErrorSurface | null>(null);
  const [finishErrorSurface, setFinishErrorSurface] =
    useState<InterviewErrorSurface | null>(null);
  const [showConflictNotice, setShowConflictNotice] = useState(false);

  const lastFailedMessageRef = useRef<string | null>(null);

  const notifyConflict = useCallback(() => {
    toast.message(
      <span className="interview-italic text-sm leading-relaxed">
        {TURN_CONFLICT_TOAST_COPY}
      </span>,
      { duration: 5000 },
    );
    void queryClient.invalidateQueries({
      queryKey: aiInterviewQueryKeys.state(applicationId),
    });
  }, [applicationId, queryClient]);

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
    notifyConflict();
  }, [notifyConflict]);

  const [bootstrapErrorSurface, setBootstrapErrorSurface] =
    useState<InterviewErrorSurface | null>(null);

  const handleBootstrapError = useCallback((error: unknown) => {
    const surface = mapInterviewErrorToSurface(error);
    if (!surface) return;
    setBootstrapErrorSurface(surface);
    fireToastIfFallback(surface);
  }, []);

  const bootstrap = useBootstrapInterviewMutation(applicationId, {
    onBootstrapError: handleBootstrapError,
  });
  const sendTurn = useSendInterviewTurnMutation(applicationId, {
    onTurnConflict: handleConflict,
    onSendError: handleSendError,
  });

  const handleCompleteError = useCallback(
    (error: unknown) => {
      if (error instanceof InterviewTurnConflictError) {
        notifyConflict();
        return;
      }
      const surface = mapInterviewErrorToSurface(error);
      if (!surface) return;
      setFinishErrorSurface(surface);
      fireToastIfFallback(surface);
    },
    [notifyConflict],
  );

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

  const startInterview = useCallback(() => {
    setBootstrapErrorSurface(null);
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

  const lastAssistantInLog = [...active.log]
    .reverse()
    .find((entry) => entry.role === "assistant");

  const canFinish =
    sendTurn.data?.canFinish ??
    bootstrap.data?.canFinish ??
    lastAssistantInLog?.intent === "suggest_finish";

  const latestGuardrailRaw = sendTurn.data?.turn.guardrailAction;
  const latestGuardrailAction: LatestTurnGuardrail | undefined =
    latestGuardrailRaw === "redirect_scope" ||
    latestGuardrailRaw === "pushback_garbage"
      ? latestGuardrailRaw
      : undefined;

  const sendInFlight = sendTurn.isPending;
  const effectiveSendError =
    sendInFlight || sendTurn.isSuccess ? null : sendErrorSurface;
  const effectiveConflictNotice =
    sendInFlight || sendTurn.isSuccess ? false : showConflictNotice;

  const atTurnCap = active.currentTurn >= INTERVIEW_MAX_TURNS;
  const displayTurn = atTurnCap ? active.currentTurn : active.currentTurn + 1;

  const baseErrorSurface =
    effectiveSendError ?? finishErrorSurface ?? bootstrapErrorSurface ?? null;

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
      displayTurn,
      maxTurns: INTERVIEW_MAX_TURNS,
      tone: progressToneForTurn(displayTurn),
      atTurnCap,
      canFinish,
    },
    errorSurface,
    showConflictNotice: effectiveConflictNotice,
    isSendingTurn: sendInFlight,
    isStartingInterview: bootstrap.isPending,
    isCapExceeded,
    summaryStatus: active.summaryStatus,
    latestGuardrailAction,
    composer,
    callbacks,
  };
}
