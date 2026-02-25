import { createFileRoute, redirect } from "@tanstack/react-router";
import { getBillingStatus } from "@/features/billing/lib/billing.client";
import { ApplicationsPage } from "@/features/applications/components/ApplicationsPage";

export const Route = createFileRoute("/_system/settings/applications")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    const data = await getBillingStatus().catch(() => null);
    const allowedRoles = ["admin", "super_admin"];
    if (!data || !allowedRoles.includes(data.role)) {
      throw redirect({ to: "/" });
    }
  },
  component: ApplicationsPage,
});
