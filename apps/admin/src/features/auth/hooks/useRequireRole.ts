import { useNavigate } from "@tanstack/react-router";
import { useBillingStatusQuery } from "@/features/billing/hooks/useBillingStatus";
import type { BillingRole } from "@/features/billing/types/billing.types";

export function useRequireRole(allowedRoles: BillingRole[]) {
  const { data, isLoading } = useBillingStatusQuery();
  const navigate = useNavigate();

  const isAllowed = !!data && allowedRoles.includes(data.role);

  if (!isLoading && !isAllowed) {
    navigate({ to: "/" });
  }

  return { isAllowed, isLoading };
}
