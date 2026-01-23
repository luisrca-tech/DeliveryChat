import { useQuery } from "@tanstack/react-query";
import { BILLING_POLL_INTERVAL_MS } from "../constants/billing.constants";
import { getBillingStatus } from "../lib/billing.client";

const billingQueryKeys = {
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
    refetchInterval: (query) =>
      query.state.data?.isReady ? false : BILLING_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });
}
