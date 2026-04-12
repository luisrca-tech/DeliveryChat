import { createFileRoute } from "@tanstack/react-router";
import { BillingSuccessPage } from "@/features/billing/components/BillingSuccessPage";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute("/_system/billing/success")({
  head: createAdminPageHead(
    "Billing updated",
    "Your subscription or payment was processed successfully.",
  ),
  component: BillingSuccessPage,
});
