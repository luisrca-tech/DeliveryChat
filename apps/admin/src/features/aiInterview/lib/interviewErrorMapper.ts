import {
  InterviewClientError,
  InterviewTurnConflictError,
} from "./aiInterview.client";

export { InterviewClientError };

export type RetryableCode =
  | "ai_timeout"
  | "ai_provider_busy"
  | "ai_provider_unavailable";

export type SystemBubbleCode = "ai_empty_response" | "ai_content_filtered";

export type InterviewErrorSurface =
  | {
      kind: "retry_row";
      code: RetryableCode;
      title: string;
      detail: string;
      retryLabel: string;
    }
  | {
      kind: "system_bubble";
      code: SystemBubbleCode;
      message: string;
    }
  | {
      kind: "blocking_banner";
      code: "ai_monthly_cap_exceeded";
      title: string;
      detail: string;
    }
  | {
      kind: "toast_fallback";
      code: string;
      message: string;
    };

const RETRY_COPY: Record<RetryableCode, { title: string; detail: string }> = {
  ai_timeout: {
    title: "The AI took too long to respond.",
    detail: "This usually clears up in a few seconds.",
  },
  ai_provider_busy: {
    title: "The AI provider is temporarily busy.",
    detail: "Give it a moment and retry.",
  },
  ai_provider_unavailable: {
    title: "The AI provider is currently unavailable.",
    detail: "We could not reach the AI service. Please retry.",
  },
};

const SYSTEM_BUBBLE_COPY: Record<SystemBubbleCode, string> = {
  ai_empty_response:
    "The AI returned an empty response. Try rephrasing your answer.",
  ai_content_filtered:
    "The AI declined to respond to that message. Try rephrasing your answer.",
};

const BLOCKING_BANNER_COPY = {
  title: "Monthly AI usage limit reached.",
  detail:
    "You have used your AI allowance for this billing period. The interview will resume next cycle, or contact your admin to upgrade.",
};

export function mapInterviewErrorToSurface(
  error: unknown,
): InterviewErrorSurface | null {
  if (error instanceof InterviewTurnConflictError) return null;

  const code = error instanceof InterviewClientError ? error.code : null;
  const status = error instanceof InterviewClientError ? error.status : 0;
  const message =
    error instanceof Error ? error.message : "Something went wrong.";

  if (code && code in RETRY_COPY) {
    const retryCode = code as RetryableCode;
    return {
      kind: "retry_row",
      code: retryCode,
      ...RETRY_COPY[retryCode],
      retryLabel: "Try again",
    };
  }

  if (code && code in SYSTEM_BUBBLE_COPY) {
    const bubbleCode = code as SystemBubbleCode;
    return {
      kind: "system_bubble",
      code: bubbleCode,
      message: SYSTEM_BUBBLE_COPY[bubbleCode],
    };
  }

  if (code === "ai_monthly_cap_exceeded") {
    return {
      kind: "blocking_banner",
      code: "ai_monthly_cap_exceeded",
      ...BLOCKING_BANNER_COPY,
    };
  }

  if (status >= 500 || !code) {
    return {
      kind: "toast_fallback",
      code: code ?? "unknown_error",
      message,
    };
  }

  return {
    kind: "toast_fallback",
    code,
    message,
  };
}
