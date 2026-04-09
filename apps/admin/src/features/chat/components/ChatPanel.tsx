import { MessageSquareOff, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { authClient } from "@/lib/authClient";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { useConversationMessagesQuery, useConversationDetailQuery } from "../hooks/useConversationsQuery";
import { useSendMessage } from "../hooks/useSendMessage";
import { useAcceptConversationMutation } from "../hooks/useConversationMutations";
import { ConversationConflictError } from "../lib/conversations.client";
import type { WSClientEvent, WSServerEvent } from "@repo/types";

type WSHandle = {
  isConnected: boolean;
  sendEvent: (event: WSClientEvent) => void;
  subscribe: (handler: (event: WSServerEvent) => void) => () => void;
  setActiveRoom: (
    conversationId: string | null,
    lastMessageId?: string,
    force?: boolean,
  ) => void;
};

type Props = {
  conversationId: string | null;
  ws: WSHandle;
  currentUserRole: string;
};

export function ChatPanel({ conversationId, ws, currentUserRole }: Props) {
  const { data: sessionInfo, isPending: sessionPending } = authClient.useSession();
  const currentUserId = sessionInfo?.user?.id ?? "";

  const { data: messagesData, isLoading: messagesLoading } =
    useConversationMessagesQuery(conversationId);
  const { data: detailData } = useConversationDetailQuery(conversationId);

  const { send } = useSendMessage(ws.sendEvent, ws.subscribe, currentUserId);
  const acceptMutation = useAcceptConversationMutation();

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center text-muted-foreground">
          <MessageSquareOff className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p className="text-lg font-medium">Select a conversation</p>
          <p className="text-sm mt-1">Choose from the list to start chatting</p>
        </div>
      </div>
    );
  }

  const conversation = detailData?.conversation;
  const messages = messagesData?.messages ?? [];
  const displayMessages = [...messages].reverse();
  const isPending = conversation?.status === "pending";
  const isActive = conversation?.status === "active";
  const isAssignedToMe =
    !!currentUserId && conversation?.assignedTo === currentUserId;
  const isStaff = currentUserRole !== "visitor";
  const canSend =
    isActive &&
    ws.isConnected &&
    !sessionPending &&
    !!currentUserId &&
    (!isStaff || isAssignedToMe);

  const handleAccept = async () => {
    try {
      await acceptMutation.mutateAsync(conversationId);
      toast.success("Conversation accepted");
      ws.setActiveRoom(conversationId, undefined, true);
    } catch (error) {
      if (error instanceof ConversationConflictError) {
        toast.error("Already taken by another operator");
      } else {
        toast.error("Failed to accept conversation");
      }
    }
  };

  return (
    <div className="flex-1 flex min-w-0">
      <div className="flex-1 flex flex-col min-w-0">
        {conversation && (
          <ChatHeader
            conversation={conversation}
            currentUserId={currentUserId}
          />
        )}
        <MessageList
          messages={displayMessages}
          isLoading={messagesLoading}
          currentUserId={currentUserId}
        />

        {isPending && (
          <div className="p-4 border-t border-border bg-yellow-50 flex items-center justify-between gap-3">
            <p className="text-sm text-yellow-800">
              This conversation is waiting for support.
            </p>
            <Button
              size="sm"
              onClick={handleAccept}
              disabled={acceptMutation.isPending}
            >
              <UserCheck className="mr-2 h-4 w-4" />
              {acceptMutation.isPending ? "Accepting..." : "Accept"}
            </Button>
          </div>
        )}

        {isActive && (
          <MessageInput
            onSend={(content) => send(conversationId, content)}
            disabled={!canSend}
            placeholder={
              !ws.isConnected
                ? "Connecting..."
                : sessionPending || !currentUserId
                  ? "Loading..."
                  : isStaff && !isAssignedToMe
                    ? "This conversation is assigned to another agent"
                    : "Type a message..."
            }
          />
        )}

        {conversation?.status === "closed" && (
          <div className="p-3 border-t border-border bg-muted/30 text-center">
            <p className="text-sm text-muted-foreground">This conversation has been resolved</p>
          </div>
        )}
      </div>
    </div>
  );
}
