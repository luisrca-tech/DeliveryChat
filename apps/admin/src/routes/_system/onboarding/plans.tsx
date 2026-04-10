import { createFileRoute } from "@tanstack/react-router";
import { PlansOnboardingPage } from "@/features/onboarding/components/PlansOnboardingPage";
import { useRequireRole } from "@/features/auth/hooks/useRequireRole";

export const Route = createFileRoute("/_system/onboarding/plans")({
  component: PlansRoute,
});

function PlansRoute() {
  const { isAllowed, isLoading } = useRequireRole(["admin", "super_admin"]);

  if (isLoading) return null;
  if (!isAllowed) return null;

  return <PlansOnboardingPage />;
}
