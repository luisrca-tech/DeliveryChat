import { createFileRoute, redirect } from "@tanstack/react-router";
import { getBillingStatus } from "@/features/billing/lib/billing.client";
import { BillingSettingsPage } from "@/features/billing/components/BillingSettingsPage";

export const Route = createFileRoute("/_system/settings/billing")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    const data = await getBillingStatus().catch(() => null);
    const allowedRoles = ["admin", "super_admin"];
    if (!data || !allowedRoles.includes(data.role)) {
      throw redirect({ to: "/" });
    }
  },
  component: BillingSettingsPage,
});
