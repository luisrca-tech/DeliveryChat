export type RateLimitConfig = {
  perSecond: number;
  perMinute: number;
  perHour: number;
};

export type RateLimitWindow = "second" | "minute" | "hour";
