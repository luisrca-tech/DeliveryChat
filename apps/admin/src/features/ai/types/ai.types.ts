export type AiErrorCode =
  | "ai_timeout"
  | "ai_provider_busy"
  | "ai_provider_unavailable"
  | "ai_empty_response"
  | "ai_content_filtered"
  | "ai_monthly_cap_exceeded"
  | "ai_feature_not_available"
  | "ai_rate_limit_exceeded"
  | "ai_not_configured"
  | "ai_application_required"
  | "conversation_not_found";

export type AiErrorResponse = {
  error: AiErrorCode | string;
  message?: string;
};

export type GenerateReplyResponse = {
  text: string;
};

export type ImproveMessageResponse = {
  text: string;
};
