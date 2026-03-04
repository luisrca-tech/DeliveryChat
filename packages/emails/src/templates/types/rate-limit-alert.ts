export type RateLimitAlertEmailProps = {
  organizationName: string;
  window: "second" | "minute" | "hour";
  currentCount: number;
  limit: number;
};
