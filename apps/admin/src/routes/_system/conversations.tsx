import { createFileRoute } from "@tanstack/react-router";
import { ConversationsPage } from "@/features/chat/components/ConversationsPage";
import { createAdminPageHead } from "@/lib/adminMeta";

export const Route = createFileRoute("/_system/conversations")({
  head: createAdminPageHead(
    "Conversations",
    "View and manage customer chat conversations and queue.",
  ),
  component: ConversationsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    conversationId: (search.conversationId as string) || undefined,
    filter: (search.filter as string) || undefined,
    appId: (search.appId as string) || undefined,
  }),
});
