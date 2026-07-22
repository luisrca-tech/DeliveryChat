import { createFileRoute } from "@tanstack/react-router";
import { DataToolsPage } from "@/features/dataTools/components/DataToolsPage";
import { useRequireRole } from "@/features/auth/hooks/useRequireRole";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute(
  "/_system/applications/$applicationId/data-tools",
)({
  head: createAdminPageHead(
    "Data Tools",
    "Manage the AI's data source and read-only tools for this application.",
  ),
  component: DataToolsRoute,
});

function DataToolsRoute() {
  const { isAllowed, isLoading } = useRequireRole(["admin", "super_admin"]);
  const { applicationId } = Route.useParams();

  if (isLoading) return null;
  if (!isAllowed) return null;

  return <DataToolsPage applicationId={applicationId} />;
}
