export const API_KEY_LIMITS = {
  FREE: 3,
  BASIC: 5,
  PREMIUM: 10,
  ENTERPRISE: 1000,
} as const;

export const RATE_LIMITS = {
  FREE: { perSecond: 5, perMinute: 50, perHour: 500 },
  BASIC: { perSecond: 10, perMinute: 100, perHour: 1000 },
  PREMIUM: { perSecond: 25, perMinute: 500, perHour: 5000 },
  ENTERPRISE: { perSecond: 50, perMinute: 1000, perHour: 10000 },
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

export function getRateLimitsByPlan(plan: string): RateLimitConfig {
  return RATE_LIMITS[plan as keyof typeof RATE_LIMITS] ?? RATE_LIMITS.FREE;
}
