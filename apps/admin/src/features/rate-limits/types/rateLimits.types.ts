export type RateLimitWindow = "second" | "minute" | "hour";

export type RateLimitsResponse = {
  limits: {
    perSecond: number;
    perMinute: number;
    perHour: number;
  };
  overrides: {
    requestsPerSecond: number | null;
    requestsPerMinute: number | null;
    requestsPerHour: number | null;
    isCustom: boolean;
  } | null;
  plan: string;
  canConfigure: boolean;
  recentEvents: Array<{
    id: string;
    eventType: string;
    window: RateLimitWindow;
    limitValue: number;
    currentCount: number;
    createdAt: string | null;
  }>;
};

export type UpdateRateLimitsRequest = {
  requestsPerSecond?: number | null;
  requestsPerMinute?: number | null;
  requestsPerHour?: number | null;
};
