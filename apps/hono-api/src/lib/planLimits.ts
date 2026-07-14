export const API_KEY_LIMITS = {
  FREE: 3,
  BASIC: 5,
  PREMIUM: 10,
  ENTERPRISE: 1000,
} as const;

export const MEMBER_LIMITS = {
  FREE: 3,
  BASIC: 6,
  PREMIUM: 15,
  ENTERPRISE: 1000,
} as const;

export const RATE_LIMITS = {
  FREE: { perSecond: 5, perMinute: 50, perHour: 500 },
  BASIC: { perSecond: 10, perMinute: 100, perHour: 1000 },
  PREMIUM: { perSecond: 25, perMinute: 500, perHour: 5000 },
  ENTERPRISE: { perSecond: 50, perMinute: 1000, perHour: 10000 },
} as const;

export const VISITOR_RATE_LIMITS = {
  perSecond: 3,
  perMinute: 30,
  perHour: 200,
} as const;

export type RateLimitConfig = {
  perSecond: number;
  perMinute: number;
  perHour: number;
};

export function getApiKeyLimitByPlan(plan: string): number {
  return (
    API_KEY_LIMITS[plan as keyof typeof API_KEY_LIMITS] ?? API_KEY_LIMITS.FREE
  );
}

export function getMemberLimitByPlan(plan: string): number {
  return (
    MEMBER_LIMITS[plan as keyof typeof MEMBER_LIMITS] ?? MEMBER_LIMITS.FREE
  );
}

export function getRateLimitsByPlan(plan: string): RateLimitConfig {
  return RATE_LIMITS[plan as keyof typeof RATE_LIMITS] ?? RATE_LIMITS.FREE;
}

// AI capability is two separate things, and plans grant them independently:
//
//   aiInterviewEnabled — AUTHORING. Run the onboarding interview and generate the
//     context summary. Every plan may author, so a prospect can experience the
//     feature before paying. FREE is additionally bounded to its 14-day trial
//     window (see `canRunInterview` in features/ai/entitlement.ts) because each
//     interview turn is a real, uncapped LLM call.
//
//   aiAssistantEnabled — SERVING. Draft replies, improve messages, answer
//     visitors. This is the part FREE never gets: a FREE org can finish the
//     interview and see its context, but the assistant stays switched off until
//     they subscribe.
//
// Keeping these apart is what lets FREE complete onboarding without ever being
// served by the AI. Collapsing them back into one flag re-breaks that.
export const AI_LIMITS = {
  FREE: {
    aiInterviewEnabled: true,
    aiAssistantEnabled: false,
    aiMonthlyCap: 0,
  },
  BASIC: {
    aiInterviewEnabled: true,
    aiAssistantEnabled: true,
    aiMonthlyCap: 1000,
  },
  PREMIUM: {
    aiInterviewEnabled: true,
    aiAssistantEnabled: true,
    aiMonthlyCap: 3000,
  },
  ENTERPRISE: {
    aiInterviewEnabled: true,
    aiAssistantEnabled: true,
    aiMonthlyCap: 3000,
  },
} as const;

export type AiLimitConfig = {
  aiInterviewEnabled: boolean;
  aiAssistantEnabled: boolean;
  aiMonthlyCap: number;
};

export function getAiLimitsByPlan(plan: string): AiLimitConfig {
  return AI_LIMITS[plan as keyof typeof AI_LIMITS] ?? AI_LIMITS.FREE;
}

/**
 * Whether the plan may be SERVED by the AI (replies, improvements, autonomous
 * turns) — as opposed to merely authoring its context. The single predicate the
 * quota gate, the summary generator, and the admin UI all consume, so "which
 * plans get the assistant" is answered in exactly one place.
 */
export function planAllowsServing(plan: string | null | undefined): boolean {
  return getAiLimitsByPlan(plan ?? "").aiAssistantEnabled;
}
