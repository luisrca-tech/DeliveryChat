import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { RateLimitsPage } from "@/features/rate-limits/components/RateLimitsPage";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute("/_system/settings/rate-limits")({
  head: createAdminPageHead(
    "Rate limits",
    "View and configure API rate limits for your organization.",
  ),
  component: RateLimitsSettingsRoute,
});

function RateLimitsSettingsRoute() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <RateLimitsPage />
    </Suspense>
  );
}
