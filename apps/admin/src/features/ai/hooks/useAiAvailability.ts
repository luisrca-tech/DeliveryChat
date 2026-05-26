import { useBillingStatusQuery } from "@/features/billing/hooks/useBillingStatus";

const AI_ENABLED_PLANS = new Set(["PREMIUM", "ENTERPRISE"]);

export function useAiAvailability() {
  const { data: billing } = useBillingStatusQuery();
  const isAvailable = billing ? AI_ENABLED_PLANS.has(billing.plan) : false;

  return { isAvailable };
}
