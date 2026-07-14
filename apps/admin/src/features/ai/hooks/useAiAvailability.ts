import { useQueryClient } from "@tanstack/react-query";
import { useBillingStatusQuery } from "@/features/billing/hooks/useBillingStatus";
import { applicationsQueryKeys } from "@/features/applications/hooks/useApplicationsQuery";
import type { ApplicationsListResponse } from "@/features/applications/types/applications.types";
import type { AiInterviewStatus } from "@/features/aiInterview/types/aiInterview.types";
import { planAllowsServing } from "../lib/aiPlanGates";

/**
 * Whether the AI may SERVE this org (drafts, replies) — BASIC and up. Every plan,
 * FREE included, may author its context through the interview; only serving plans
 * get answered by the AI.
 *
 * This is NOT the gate for auto-respond and data tools: those are add-on
 * capabilities and use `resolveAiLock` from `lib/aiPlanGates`.
 */
export function useAiAvailability(applicationId?: string | null) {
  const { data: billing } = useBillingStatusQuery();
  const queryClient = useQueryClient();

  const servingAvailable = planAllowsServing(billing?.plan);

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
