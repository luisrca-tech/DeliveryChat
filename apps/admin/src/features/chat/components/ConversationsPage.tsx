import { useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { ConversationListPanel } from "./ConversationListPanel";
import { ChatPanel } from "./ChatPanel";
import { useWebSocket } from "../hooks/useWebSocket";
import { useConversationNotifications } from "../hooks/useConversationNotifications";
import { useMembersQuery } from "@/features/members/hooks/useMembersQuery";

export function ConversationsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const ws = useWebSocket();
  useConversationNotifications(ws.subscribe);

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
        selectedId={selectedId}
        onSelect={setSelectedId}
        currentUserId={currentUserId}
      />
      <ChatPanel
        conversationId={selectedId}
        ws={ws}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
      />
    </div>
  );
}
