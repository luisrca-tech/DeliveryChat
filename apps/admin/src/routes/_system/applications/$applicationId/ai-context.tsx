import { createFileRoute } from "@tanstack/react-router";
import { AiContextPage } from "@/features/aiInterview/components/AiContextPage";
import { useRequireRole } from "@/features/auth/hooks/useRequireRole";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute(
  "/_system/applications/$applicationId/ai-context",
)({
  head: createAdminPageHead(
    "AI Context",
    "Review the AI context summary and interview transcript for this application.",
  ),
  component: AiContextRoute,
});

function AiContextRoute() {
  const { isAllowed, isLoading } = useRequireRole(["admin", "super_admin"]);
  const { applicationId } = Route.useParams();

  if (isLoading) return null;
  if (!isAllowed) return null;

  return <AiContextPage applicationId={applicationId} />;
}
