import { createFileRoute } from "@tanstack/react-router";
import { ApplicationsPage } from "@/features/applications/components/ApplicationsPage";
import { useRequireRole } from "@/features/auth/hooks/useRequireRole";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute("/_system/settings/applications")({
  head: createAdminPageHead(
    "Applications",
    "Create and manage embedded chat applications and domains.",
  ),
  component: ApplicationsRoute,
});

function ApplicationsRoute() {
  const { isAllowed, isLoading } = useRequireRole(["admin", "super_admin"]);

  if (isLoading) return null;
  if (!isAllowed) return null;

  return <ApplicationsPage />;
}
