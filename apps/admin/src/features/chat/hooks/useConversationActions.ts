import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { Route } from "@/routes/_system/conversations";
import { authClient } from "@/lib/authClient";
import { ConversationConflictError } from "../lib/conversations.client";
import {
  navigateSearchAfterAccept,
  navigateSearchAfterLeave,
  navigateSearchAfterResolve,
} from "../lib/conversationSearchNavigation";
import {
  useAcceptConversationMutation,
  useLeaveConversationMutation,
  useResolveConversationMutation,
} from "./useConversationMutations";

type SetActiveRoom = (
  conversationId: string | null,
  lastMessageId?: string,
  force?: boolean,
) => void;

export function useAcceptAction(
  currentUserRole: string,
  setActiveRoom: SetActiveRoom,
) {
  const navigate = useNavigate({ from: Route.fullPath });
  const { filter: urlFilter } = Route.useSearch();
  const { data: sessionInfo } = authClient.useSession();
  const currentUserId = sessionInfo?.user?.id ?? "";
  const mutation = useAcceptConversationMutation(currentUserId);

  const execute = async (conversationId: string): Promise<boolean> => {
    try {
      await mutation.mutateAsync(conversationId);
      navigateSearchAfterAccept(
        navigate,
        conversationId,
        currentUserRole,
        urlFilter,
      );
      toast.success("Conversation accepted");
      setActiveRoom(conversationId, undefined, true);
      return true;
    } catch (error) {
      if (error instanceof ConversationConflictError) {
        toast.error("Already taken by another operator");
      } else {
        toast.error("Failed to accept conversation");
      }
      return false;
    }
  };

  return { execute, isPending: mutation.isPending };
}

export function useLeaveAction() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { filter: urlFilter } = Route.useSearch();
  const mutation = useLeaveConversationMutation();

  const execute = async (conversationId: string): Promise<boolean> => {
    try {
      await mutation.mutateAsync(conversationId);
      navigateSearchAfterLeave(navigate, conversationId, urlFilter);
      toast.success("Left conversation — returned to queue");
      return true;
    } catch {
      toast.error("Failed to leave conversation");
      return false;
    }
  };

  return { execute, isPending: mutation.isPending };
}

export function useResolveAction() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { filter: urlFilter } = Route.useSearch();
  const mutation = useResolveConversationMutation();

  const execute = async (conversationId: string): Promise<boolean> => {
    try {
      await mutation.mutateAsync(conversationId);
      navigateSearchAfterResolve(navigate, conversationId, urlFilter);
      toast.success("Conversation marked as solved");
      return true;
    } catch {
      toast.error("Failed to resolve conversation");
      return false;
    }
  };

  return { execute, isPending: mutation.isPending };
}
