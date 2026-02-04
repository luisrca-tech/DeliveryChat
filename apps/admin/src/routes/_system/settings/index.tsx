import { createFileRoute } from "@tanstack/react-router";
import { SettingsIndexPage } from "@/features/settings/components/SettingsIndexPage";

export const Route = createFileRoute("/_system/settings/")({
  component: SettingsIndexPage,
});
