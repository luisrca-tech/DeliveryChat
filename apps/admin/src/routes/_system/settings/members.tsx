import { createFileRoute } from "@tanstack/react-router";
import { MembersPage } from "@/features/members/components/MembersPage";
import { useRequireRole } from "@/features/auth/hooks/useRequireRole";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute("/_system/settings/members")({
  head: createAdminPageHead(
    "Members",
    "Invite and manage organization members and roles.",
  ),
  component: MembersRoute,
});

function MembersRoute() {
  const { isAllowed, isLoading } = useRequireRole(["admin", "super_admin"]);

  if (isLoading) return null;
  if (!isAllowed) return null;

  return <MembersPage />;
}
