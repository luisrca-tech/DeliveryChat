import { createFileRoute } from "@tanstack/react-router";
import { AiUsagePage } from "@/features/ai/components/AiUsagePage";
import { useRequireRole } from "@/features/auth/hooks/useRequireRole";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute("/_system/settings/ai-usage")({
  head: createAdminPageHead(
    "AI Usage",
    "View AI assistant usage and audit logs for your organization.",
  ),
  component: AiUsageRoute,
});

function AiUsageRoute() {
  const { isAllowed, isLoading } = useRequireRole(["admin", "super_admin"]);

  if (isLoading) return null;
  if (!isAllowed) return null;

  return <AiUsagePage />;
}
