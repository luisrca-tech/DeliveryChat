import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/authClient";
import { ConversationListPanel } from "./ConversationListPanel";
import { ChatPanel } from "./ChatPanel";
import { useWebSocket } from "../hooks/useWebSocket";
import { useConversationNotifications } from "../hooks/useConversationNotifications";
import { useInferMissingConversationFilterUrl } from "../hooks/useInferMissingConversationFilterUrl";
import { useConversationUrlFilterSync } from "../hooks/useConversationUrlFilterSync";
import { useMembersQuery } from "@/features/members/hooks/useMembersQuery";
import { useAuthSession } from "@/features/auth/hooks/useAuthSession";
import { conversationsQueryKeys } from "../hooks/useConversationsQuery";
import { markConversationAsRead } from "../lib/conversations.client";
import { Route } from "@/routes/_system/conversations";
import type { ConversationsListResponse } from "../types/chat.types";

export function ConversationsPage() {
  const { conversationId: selectedId, filter: urlFilter, appId } =
    Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const ws = useWebSocket(selectedId ?? null);
  const { data: sessionData } = authClient.useSession();
  const sessionUserId = sessionData?.user?.id ?? "";

  const { data: authData } = useAuthSession();
  const routeUserId = authData?.user?.id ?? "";

  const { data: membersData } = useMembersQuery();
  const actorId = sessionUserId || routeUserId;
  const currentUserRole =
    membersData?.users?.find((m) => m.id === actorId)?.role ?? "operator";

  const isAdmin =
    currentUserRole === "admin" || currentUserRole === "super_admin";
  const defaultFilter = isAdmin ? "all" : "queue";
  const resolvedFilter = urlFilter ?? defaultFilter;

  const setSelectedId = useCallback(
    (id: string) => {
      navigate({
        search: (prev) => ({
          ...prev,
          conversationId: id,
          filter: prev.filter ?? resolvedFilter,
          appId: prev.appId ?? appId,
        }),
      });

      // Cancel in-flight list queries so they don't overwrite with stale unreadCount
      queryClient.cancelQueries({ queryKey: conversationsQueryKeys.all() });

      queryClient.setQueriesData<ConversationsListResponse>(
        { queryKey: conversationsQueryKeys.all() },
        (old) => {
          if (!old || !old.conversations) return old;
          return {
            ...old,
            conversations: old.conversations.map((c) =>
              c.id === id ? { ...c, unreadCount: 0 } : c,
            ),
          };
        },
      );

      markConversationAsRead(id)
        .then(() =>
          queryClient.invalidateQueries({
            queryKey: conversationsQueryKeys.all(),
          }),
        )
        .catch(console.error);
    },
    [navigate, queryClient, resolvedFilter, appId],
  );

  useInferMissingConversationFilterUrl(
    selectedId,
    urlFilter,
    currentUserRole,
    sessionUserId,
    navigate,
  );

  useConversationUrlFilterSync(
    selectedId,
    urlFilter,
    sessionUserId,
    currentUserRole,
    navigate,
    ws.subscribe,
  );

  useConversationNotifications(ws.subscribe, selectedId ?? null, setSelectedId, sessionUserId);

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
