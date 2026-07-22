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

/** Backend codes that mean "this needs a paid plan", not "this went wrong". */
export type UpgradeCode =
  | "ai_feature_not_available"
  | "ai_interview_trial_expired";

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
      kind: "upgrade_banner";
      code: UpgradeCode;
      title: string;
      detail: string;
      ctaLabel: string;
    }
  | {
      kind: "missing_topics";
      code: "interview_checklist_incomplete";
      title: string;
      detail: string;
      missingLabels: string[];
    }
  | {
      kind: "full_page_error";
      code: "summary_generation_failed";
      title: string;
      detail: string;
      retryLabel: string;
    }
  | {
      kind: "toast_fallback";
      code: string;
      message: string;
    };

const CORE_TOPIC_LABELS: Record<string, string> = {
  business_description: "Business description",
  target_audience: "Target audience",
  products_services: "Products and services",
  preferred_tone: "Preferred tone",
  common_support_scenarios: "Common support scenarios",
  prohibited_topics: "Prohibited topics",
};

export function humaniseMissingTopic(topic: string): string {
  if (topic in CORE_TOPIC_LABELS) return CORE_TOPIC_LABELS[topic]!;
  return topic
    .split("_")
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}

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

const UPGRADE_COPY: Record<UpgradeCode, { title: string; detail: string }> = {
  ai_feature_not_available: {
    title: "The AI assistant is not included in your current plan.",
    detail:
      "Choose a plan to turn the assistant on. Any context you have already written is kept.",
  },
  ai_interview_trial_expired: {
    title: "Your free trial has ended.",
    detail:
      "Setting up the AI assistant is available during the 14-day trial, and on any paid plan. Choose a plan to pick up where you left off.",
  },
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

  if (code === "interview_checklist_incomplete") {
    const missing = error instanceof InterviewClientError ? error.missing : [];
    return {
      kind: "missing_topics",
      code: "interview_checklist_incomplete",
      title: "A few topics still need answers before finishing.",
      detail: "Please cover the remaining topics, then try again.",
      missingLabels: (missing ?? []).map(humaniseMissingTopic),
    };
  }

  if (code === "summary_generation_failed") {
    return {
      kind: "full_page_error",
      code: "summary_generation_failed",
      title: "We could not generate the AI context.",
      detail:
        "Your interview was saved, but the summary step failed. You can retry without losing your answers.",
      retryLabel: "Retry generation",
    };
  }

  if (code && code in UPGRADE_COPY) {
    const upgradeCode = code as UpgradeCode;
    return {
      kind: "upgrade_banner",
      code: upgradeCode,
      ...UPGRADE_COPY[upgradeCode],
      ctaLabel: "See plans",
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
