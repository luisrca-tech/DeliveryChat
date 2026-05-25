export type AiErrorCode =
  | "ai_timeout"
  | "ai_provider_busy"
  | "ai_provider_unavailable"
  | "ai_empty_response"
  | "ai_content_filtered"
  | "ai_monthly_cap_exceeded"
  | "ai_feature_not_available"
  | "ai_rate_limit_exceeded";

export type AiErrorResponse = {
  error: AiErrorCode | string;
  message?: string;
};

export type GenerateReplyResponse = {
  text: string;
};
