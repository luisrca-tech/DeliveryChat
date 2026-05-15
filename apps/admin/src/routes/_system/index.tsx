import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_system/")({
  beforeLoad: () => {
    throw redirect({
      to: "/conversations",
      search: {
        conversationId: undefined,
        filter: undefined,
        appId: undefined,
      },
    });
  },
});
