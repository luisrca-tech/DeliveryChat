import { createFileRoute } from "@tanstack/react-router";
import { ConversationsPage } from "@/features/chat/components/ConversationsPage";

export const Route = createFileRoute("/_system/conversations")({
  component: ConversationsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    conversationId: (search.conversationId as string) || undefined,
  }),
});
