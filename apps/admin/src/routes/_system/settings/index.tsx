import { createFileRoute } from "@tanstack/react-router";
import { SettingsIndexPage } from "@/features/settings/components/SettingsIndexPage";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute("/_system/settings/")({
  head: createAdminPageHead(
    "Settings",
    "Manage subscription, applications, API keys, members, and rate limits.",
  ),
  component: SettingsIndexPage,
});
