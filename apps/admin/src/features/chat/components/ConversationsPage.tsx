import { useRouteContext, useNavigate } from "@tanstack/react-router";
import { authClient } from "@/lib/authClient";
import { ConversationListPanel } from "./ConversationListPanel";
import { ChatPanel } from "./ChatPanel";
import { useWebSocket } from "../hooks/useWebSocket";
import { useConversationNotifications } from "../hooks/useConversationNotifications";
import { useInferMissingConversationFilterUrl } from "../hooks/useInferMissingConversationFilterUrl";
import { useMembersQuery } from "@/features/members/hooks/useMembersQuery";
import { Route } from "@/routes/_system/conversations";

export function ConversationsPage() {
  const { conversationId: selectedId, filter: urlFilter, appId } =
    Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const ws = useWebSocket(selectedId ?? null);
  const { data: sessionData } = authClient.useSession();
  const sessionUserId = sessionData?.user?.id ?? "";

  const context = useRouteContext({ from: "/_system" }) as {
    session?: { userId?: string };
    user?: { id?: string };
  };
  const routeUserId = context?.user?.id ?? context?.session?.userId ?? "";

  const { data: membersData } = useMembersQuery();
  const actorId = sessionUserId || routeUserId;
  const currentUserRole =
    membersData?.users?.find((m) => m.id === actorId)?.role ?? "operator";

  const isAdmin =
    currentUserRole === "admin" || currentUserRole === "super_admin";
  const defaultFilter = isAdmin ? "all" : "queue";
  const resolvedFilter = urlFilter ?? defaultFilter;

  useInferMissingConversationFilterUrl(
    selectedId,
    urlFilter,
    currentUserRole,
    sessionUserId,
    navigate,
  );

  useConversationNotifications(ws.subscribe);

  const setSelectedId = (id: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        conversationId: id,
        filter: prev.filter ?? resolvedFilter,
        appId: prev.appId ?? appId,
      }),
    });
  };

  const onFiltersChange = (newFilter: string, newAppId: string | undefined) => {
    navigate({
      search: (prev) => ({
        ...prev,
        filter: newFilter,
        appId: newAppId,
      }),
    });
  };

  return (
    <div className="flex h-[calc(100vh-1px)] -m-6">
      <ConversationListPanel
        selectedId={selectedId ?? null}
        onSelect={setSelectedId}
        currentUserRole={currentUserRole}
        filter={resolvedFilter}
        appId={appId}
        onFiltersChange={onFiltersChange}
      />
      <ChatPanel
        conversationId={selectedId ?? null}
        ws={ws}
        currentUserRole={currentUserRole}
      />
    </div>
  );
}
