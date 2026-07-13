import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BILLING_POLL_INTERVAL_MS,
  BILLING_POLL_MAX_ATTEMPTS,
} from "../constants/billing.constants";
import { billingQueryKeys } from "./useBillingStatus";
import {
  cancelAiAddon,
  enableAiAddon,
  getAiAddonPreview,
  getBillingStatus,
} from "../lib/billing.client";

export const aiAddonQueryKeys = {
  preview: () => ["billing", "ai-addon", "preview"] as const,
};

/**
 * Fetches the purchase preview (prorated amount now + recurring amount). Only
 * runs while `enabled` (i.e. the confirm dialog is open) so we never call
 * Stripe's preview API on page load. Not cached across opens so the amounts are
 * always fresh at the moment of decision.
 */
export function useAiAddonPreviewQuery(enabled: boolean) {
  return useQuery({
    queryKey: aiAddonQueryKeys.preview(),
    queryFn: getAiAddonPreview,
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

export function useEnableAiAddonMutation() {
  return useMutation({
    mutationFn: enableAiAddon,
  });
}

export function useCancelAiAddonMutation() {
  return useMutation({
    mutationFn: cancelAiAddon,
  });
}

/**
 * Polls `GET /billing/status` (shared cache key with `useBillingStatusQuery`)
 * until `aiAddonActive` matches `targetActive` — the entitlement flips
 * asynchronously once Stripe's webhook lands. Mirrors
 * `useBillingStatusPollingQuery`'s bounded-attempts pattern.
 */
export function useAiAddonStatusPollingQuery(
  enabled: boolean,
  targetActive: boolean,
) {
  return useQuery({
    queryKey: billingQueryKeys.status(),
    queryFn: getBillingStatus,
    enabled,
    staleTime: 0,
    refetchInterval: (query) => {
      if (query.state.data?.aiAddonActive === targetActive) return false;

      const attempts =
        query.state.dataUpdateCount + query.state.errorUpdateCount;
      if (attempts >= BILLING_POLL_MAX_ATTEMPTS) return false;

      return BILLING_POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: true,
  });
}
