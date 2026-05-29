import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useRequireRole } from "@/features/auth/hooks/useRequireRole";

export const Route = createFileRoute("/_system/applications")({
  component: ApplicationsLayout,
});

function ApplicationsLayout() {
  const { isAllowed, isLoading } = useRequireRole(["admin", "super_admin"]);

  if (isLoading) return null;
  if (!isAllowed) return null;

  return <Outlet />;
}
