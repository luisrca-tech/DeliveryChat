import { createFileRoute } from "@tanstack/react-router";
import { PlansOnboardingPage } from "@/features/onboarding/components/PlansOnboardingPage";

export const Route = createFileRoute("/_system/onboarding/plans")({
  component: PlansOnboardingPage,
});
