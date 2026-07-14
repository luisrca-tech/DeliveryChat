import { useQueryClient } from "@tanstack/react-query";
import { useBillingStatusQuery } from "@/features/billing/hooks/useBillingStatus";
import { applicationsQueryKeys } from "@/features/applications/hooks/useApplicationsQuery";
import type { ApplicationsListResponse } from "@/features/applications/types/applications.types";
import type { AiInterviewStatus } from "@/features/aiInterview/types/aiInterview.types";

/**
 * Plans the AI assistant may actually SERVE on. Every plan (FREE included) may
 * author its context through the interview — only these plans may be answered by
 * the AI. Mirrors `planAllowsServing` in hono-api's planLimits.
 */
const AI_SERVING_PLANS = new Set(["BASIC", "PREMIUM", "ENTERPRISE"]);

export function useAiAvailability(applicationId?: string | null) {
  const { data: billing } = useBillingStatusQuery();
  const queryClient = useQueryClient();

  const servingAvailable = billing ? AI_SERVING_PLANS.has(billing.plan) : false;

  if (!applicationId) {
    return {
      isAvailable: servingAvailable,
      servingAvailable,
      appConfigured: true,
    };
  }

  const lists = queryClient.getQueriesData<ApplicationsListResponse>({
    queryKey: applicationsQueryKeys.all(),
  });

  let appStatus: AiInterviewStatus | undefined;
  for (const [, data] of lists) {
    const found = data?.applications?.find((a) => a.id === applicationId);
    if (found) {
      appStatus = found.aiInterviewStatus;
      break;
    }
  }

  const appConfigured = appStatus === "completed";
  const isAvailable = servingAvailable && appConfigured;
  return { isAvailable, servingAvailable, appConfigured };
}
