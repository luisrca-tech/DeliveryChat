import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_system/settings/applications")({
  beforeLoad: () => {
    throw redirect({ to: "/applications" });
  },
});
