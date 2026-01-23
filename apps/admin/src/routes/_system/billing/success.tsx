import { createFileRoute } from "@tanstack/react-router";
import { BillingSuccessPage } from "@/features/billing/components/BillingSuccessPage";

export const Route = createFileRoute("/_system/billing/success")({
  component: BillingSuccessPage,
});
