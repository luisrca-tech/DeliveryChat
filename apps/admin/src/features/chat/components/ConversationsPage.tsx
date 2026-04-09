import { useRouteContext, useNavigate } from "@tanstack/react-router";
import { ConversationListPanel } from "./ConversationListPanel";
import { ChatPanel } from "./ChatPanel";
import { useWebSocket } from "../hooks/useWebSocket";
import { useConversationNotifications } from "../hooks/useConversationNotifications";
import { useMembersQuery } from "@/features/members/hooks/useMembersQuery";
import { Route } from "@/routes/_system/conversations";

export function ConversationsPage() {
  const { conversationId: selectedId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const ws = useWebSocket();
  useConversationNotifications(ws.subscribe);

  const setSelectedId = (id: string) => {
    navigate({ search: { conversationId: id } });
  };

  const context = useRouteContext({ from: "/_system" }) as {
    session?: { userId?: string };
    user?: { id?: string };
  };
  const currentUserId = context?.user?.id ?? context?.session?.userId ?? "";

  const { data: membersData } = useMembersQuery();
  const currentUserRole =
    membersData?.users?.find((m) => m.id === currentUserId)?.role ?? "operator";

  return (
    <div className="flex h-[calc(100vh-1px)] -m-6">
      <ConversationListPanel
        selectedId={selectedId ?? null}
        onSelect={setSelectedId}
        currentUserRole={currentUserRole}
      />
      <ChatPanel
        conversationId={selectedId ?? null}
        ws={ws}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
      />
    </div>
  );
}
