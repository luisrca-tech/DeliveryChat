import { createFileRoute } from "@tanstack/react-router";
import { ApplicationsPage } from "@/features/applications/components/ApplicationsPage";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute("/_system/applications/")({
  head: createAdminPageHead(
    "Applications",
    "Create and manage embedded chat applications and domains.",
  ),
  component: ApplicationsPage,
});
