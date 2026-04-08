import { createFileRoute, redirect } from "@tanstack/react-router";
import { getBillingStatus } from "@/features/billing/lib/billing.client";
import { MembersPage } from "@/features/members/components/MembersPage";

export const Route = createFileRoute("/_system/settings/members")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;

    const data = await getBillingStatus().catch(() => null);
    const allowedRoles = ["admin", "super_admin"];
    if (!data || !allowedRoles.includes(data.role)) {
      throw redirect({ to: "/" });
    }
  },
  component: MembersPage,
});
