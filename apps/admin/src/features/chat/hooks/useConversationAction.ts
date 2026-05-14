import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import type { NavigateOptions } from "@tanstack/react-router";
import { Route } from "@/routes/_system/conversations";
import { authClient } from "@/lib/authClient";
import { ConversationConflictError } from "../lib/conversations.client";
import {
  inferFilterForAction,
  type ConversationAction,
  type FilterId,
} from "../lib/conversationFilterInference";
import {
  useAcceptConversationMutation,
  useLeaveConversationMutation,
  useResolveConversationMutation,
} from "./useConversationMutations";

type NavigateFn = (opts: NavigateOptions) => void;

type SetActiveRoom = (
  conversationId: string | null,
  lastMessageId?: string,
  force?: boolean,
) => void;

function navigateToFilter(
  navigate: NavigateFn,
  conversationId: string,
  currentFilter: string | undefined,
  targetFilter: FilterId,
): void {
  if (currentFilter === targetFilter) return;
  navigate({
    search: (prev) => ({
      ...prev,
      filter: targetFilter,
      conversationId: prev.conversationId ?? conversationId,
      appId: prev.appId,
    }),
    replace: true,
  });
}

const ACTION_CONFIG: Record<
  ConversationAction,
  { successMessage: string; errorMessage: string }
> = {
  accept: {
    successMessage: "Conversation accepted",
    errorMessage: "Failed to accept conversation",
  },
  leave: {
    successMessage: "Left conversation — returned to queue",
    errorMessage: "Failed to leave conversation",
  },
  resolve: {
    successMessage: "Conversation marked as solved",
    errorMessage: "Failed to resolve conversation",
  },
};

export function useConversationAction(
  type: ConversationAction,
  currentUserRole: string,
  setActiveRoom?: SetActiveRoom,
) {
  const navigate = useNavigate({ from: Route.fullPath });
  const { filter: urlFilter } = Route.useSearch();
  const { data: sessionInfo } = authClient.useSession();
  const currentUserId = sessionInfo?.user?.id ?? "";

  const acceptMutation = useAcceptConversationMutation(currentUserId);
  const leaveMutation = useLeaveConversationMutation();
  const resolveMutation = useResolveConversationMutation();

  const mutations = {
    accept: acceptMutation,
    leave: leaveMutation,
    resolve: resolveMutation,
  };

  const mutation = mutations[type];
  const config = ACTION_CONFIG[type];

  const execute = async (conversationId: string): Promise<boolean> => {
    try {
      await mutation.mutateAsync(conversationId);
      const targetFilter = inferFilterForAction(type, currentUserRole);
      navigateToFilter(navigate, conversationId, urlFilter, targetFilter);
      toast.success(config.successMessage);
      if (type === "accept" && setActiveRoom) {
        setActiveRoom(conversationId, undefined, true);
      }
      return true;
    } catch (error) {
      if (type === "accept" && error instanceof ConversationConflictError) {
        toast.error("Already taken by another operator");
      } else {
        toast.error(config.errorMessage);
      }
      return false;
    }
  };

  return { execute, isPending: mutation.isPending };
}
