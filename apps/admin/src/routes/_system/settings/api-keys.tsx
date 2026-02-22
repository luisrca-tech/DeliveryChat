import { createFileRoute, redirect } from "@tanstack/react-router";
import { getBillingStatus } from "@/features/billing/lib/billing.client";
import { ApiKeysPage } from "@/features/api-keys/components/ApiKeysPage";

export const Route = createFileRoute("/_system/settings/api-keys")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    const data = await getBillingStatus().catch(() => null);
    const allowedRoles = ["admin", "super_admin"];
    if (!data || !allowedRoles.includes(data.role)) {
      throw redirect({ to: "/" });
    }
  },
  component: ApiKeysPage,
});
