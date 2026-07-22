import { createFileRoute } from "@tanstack/react-router";
import { ApplicationDetailsPage } from "@/features/applications/components/ApplicationDetailsPage";
import { useRequireRole } from "@/features/auth/hooks/useRequireRole";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute("/_system/applications/$applicationId/")({
  head: createAdminPageHead(
    "Application Details",
    "View and edit this application's configuration.",
  ),
  component: ApplicationDetailsRoute,
});

function ApplicationDetailsRoute() {
  const { isAllowed, isLoading } = useRequireRole(["admin", "super_admin"]);
  const { applicationId } = Route.useParams();

  if (isLoading) return null;
  if (!isAllowed) return null;

  return <ApplicationDetailsPage applicationId={applicationId} />;
}
