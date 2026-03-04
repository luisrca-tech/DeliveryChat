import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { RateLimitsPage } from "@/features/rate-limits/components/RateLimitsPage";

export const Route = createFileRoute("/_system/settings/rate-limits")({
  component: RateLimitsSettingsRoute,
});

function RateLimitsSettingsRoute() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <RateLimitsPage />
    </Suspense>
  );
}
