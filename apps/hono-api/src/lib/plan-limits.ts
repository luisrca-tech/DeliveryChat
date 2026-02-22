export const API_KEY_LIMITS = {
  FREE: 3,
  BASIC: 5,
  PREMIUM: 10,
  ENTERPRISE: 1000,
} as const;

export function getApiKeyLimitByPlan(plan: string): number {
  return (
    API_KEY_LIMITS[plan as keyof typeof API_KEY_LIMITS] ?? API_KEY_LIMITS.FREE
  );
}
