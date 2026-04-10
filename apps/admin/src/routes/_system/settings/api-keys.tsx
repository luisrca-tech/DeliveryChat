import { createFileRoute } from "@tanstack/react-router";
import { ApiKeysPage } from "@/features/api-keys/components/ApiKeysPage";
import { useRequireRole } from "@/features/auth/hooks/useRequireRole";

export const Route = createFileRoute("/_system/settings/api-keys")({
  component: ApiKeysRoute,
});

function ApiKeysRoute() {
  const { isAllowed, isLoading } = useRequireRole(["admin", "super_admin"]);

  if (isLoading) return null;
  if (!isAllowed) return null;

  return <ApiKeysPage />;
}
