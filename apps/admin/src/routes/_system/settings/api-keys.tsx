import { createFileRoute } from "@tanstack/react-router";
import { ApiKeysPage } from "@/features/api-keys/components/ApiKeysPage";
import { useRequireRole } from "@/features/auth/hooks/useRequireRole";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute("/_system/settings/api-keys")({
  head: createAdminPageHead(
    "API keys",
    "Create and revoke API keys for your chat applications.",
  ),
  component: ApiKeysRoute,
});

function ApiKeysRoute() {
  const { isAllowed, isLoading } = useRequireRole(["admin", "super_admin"]);

  if (isLoading) return null;
  if (!isAllowed) return null;

  return <ApiKeysPage />;
}
