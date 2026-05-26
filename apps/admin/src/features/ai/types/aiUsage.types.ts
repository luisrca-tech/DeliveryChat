export type AiUsageLogEntry = {
  id: string;
  tenantId: string;
  userId: string;
  operatorName: string | null;
  action: "generate" | "improve";
  conversationId: string | null;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  finishReason: string | null;
  status:
    | "success"
    | "provider_error"
    | "timeout"
    | "empty"
    | "content_filtered"
    | "aborted";
  createdAt: string;
};

export type AiUsageLogsResponse = {
  logs: AiUsageLogEntry[];
  total: number;
  limit: number;
  offset: number;
};

export type AiUsageFilters = {
  action?: string;
  status?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
};
