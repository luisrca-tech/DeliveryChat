import { createFileRoute } from "@tanstack/react-router";
import { BillingSettingsPage } from "@/features/billing/components/BillingSettingsPage";
import { useRequireRole } from "@/features/auth/hooks/useRequireRole";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute("/_system/settings/billing")({
  head: createAdminPageHead(
    "Billing",
    "Manage subscription, payment methods, and invoices.",
  ),
  component: BillingRoute,
});

function BillingRoute() {
  const { isAllowed, isLoading } = useRequireRole(["admin", "super_admin"]);

  if (isLoading) return null;
  if (!isAllowed) return null;

  return <BillingSettingsPage />;
}
