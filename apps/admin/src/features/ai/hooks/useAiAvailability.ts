import { useQueryClient } from "@tanstack/react-query";
import { useBillingStatusQuery } from "@/features/billing/hooks/useBillingStatus";
import { applicationsQueryKeys } from "@/features/applications/hooks/useApplicationsQuery";
import type { ApplicationsListResponse } from "@/features/applications/types/applications.types";
import type { AiInterviewStatus } from "@/features/aiInterview/types/aiInterview.types";

const AI_ENABLED_PLANS = new Set(["PREMIUM", "ENTERPRISE"]);

export function useAiAvailability(applicationId?: string | null) {
  const { data: billing } = useBillingStatusQuery();
  const queryClient = useQueryClient();

  const planAvailable = billing ? AI_ENABLED_PLANS.has(billing.plan) : false;

  if (!applicationId) {
    return { isAvailable: planAvailable, planAvailable, appConfigured: true };
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
  const isAvailable = planAvailable && appConfigured;
  return { isAvailable, planAvailable, appConfigured };
}
