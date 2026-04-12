import { createFileRoute } from "@tanstack/react-router";
import { PlansOnboardingPage } from "@/features/onboarding/components/PlansOnboardingPage";
import { useRequireRole } from "@/features/auth/hooks/useRequireRole";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute("/_system/onboarding/plans")({
  head: createAdminPageHead(
    "Choose a plan",
    "Select a subscription plan for your Delivery Chat organization.",
  ),
  component: PlansRoute,
});

function PlansRoute() {
  const { isAllowed, isLoading } = useRequireRole(["admin", "super_admin"]);

  if (isLoading) return null;
  if (!isAllowed) return null;

  return <PlansOnboardingPage />;
}
