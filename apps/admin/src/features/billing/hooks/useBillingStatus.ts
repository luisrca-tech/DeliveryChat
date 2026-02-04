import { useQuery } from "@tanstack/react-query";
import {
  BILLING_POLL_INTERVAL_MS,
  BILLING_POLL_MAX_ATTEMPTS,
} from "../constants/billing.constants";
import { getBillingStatus } from "../lib/billing.client";

export const billingQueryKeys = {
  status: () => ["billingStatus"] as const,
};

export function useBillingStatusQuery() {
  return useQuery({
    queryKey: billingQueryKeys.status(),
    queryFn: getBillingStatus,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function useBillingStatusPollingQuery() {
  return useQuery({
    queryKey: billingQueryKeys.status(),
    queryFn: getBillingStatus,
    staleTime: 0,
    refetchInterval: (query) => {
      if (query.state.data?.isReady) return false;

      const attempts =
        query.state.dataUpdateCount + query.state.errorUpdateCount;
      if (attempts >= BILLING_POLL_MAX_ATTEMPTS) return false;

      return BILLING_POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: true,
  });
}
