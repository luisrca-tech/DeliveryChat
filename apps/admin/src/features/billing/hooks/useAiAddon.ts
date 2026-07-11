import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BILLING_POLL_INTERVAL_MS,
  BILLING_POLL_MAX_ATTEMPTS,
} from "../constants/billing.constants";
import { billingQueryKeys } from "./useBillingStatus";
import {
  cancelAiAddon,
  enableAiAddon,
  getBillingStatus,
} from "../lib/billing.client";

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
