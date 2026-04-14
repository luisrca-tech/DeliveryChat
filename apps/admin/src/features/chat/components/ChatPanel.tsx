import { MessageSquareOff, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { authClient } from "@/lib/authClient";
import { ChatHeader } from "./ChatHeader";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { useNavigate } from "@tanstack/react-router";
import { useConversationMessagesQuery, useConversationDetailQuery } from "../hooks/useConversationsQuery";
import { useSendMessage } from "../hooks/useSendMessage";
import { useMessageActions } from "../hooks/useMessageActions";
import { useAcceptConversationMutation } from "../hooks/useConversationMutations";
import { ConversationConflictError } from "../lib/conversations.client";
import { navigateSearchAfterAccept } from "../lib/conversationSearchNavigation";
import type { WSClientEvent, WSServerEvent } from "@repo/types";
import type { TypingUser } from "../hooks/useWebSocket";
import { Route } from "@/routes/_system/conversations";

type WSHandle = {
  isConnected: boolean;
  sendEvent: (event: WSClientEvent) => void;
  subscribe: (handler: (event: WSServerEvent) => void) => () => void;
  setActiveRoom: (
    conversationId: string | null,
    lastMessageId?: string,
    force?: boolean,
  ) => void;
  typingUser: TypingUser;
  registerAckedId: (serverMessageId: string) => void;
};

type Props = {
  conversationId: string | null;
  ws: WSHandle;
  currentUserRole: string;
};

export function ChatPanel({ conversationId, ws, currentUserRole }: Props) {
  const navigate = useNavigate({ from: Route.fullPath });
  const { filter: urlFilter } = Route.useSearch();
  const { data: sessionInfo, isPending: sessionPending } = authClient.useSession();
  const currentUserId = sessionInfo?.user?.id ?? "";

  const { data: messagesData, isLoading: messagesLoading } =
    useConversationMessagesQuery(conversationId);
  const { data: detailData } = useConversationDetailQuery(conversationId);

  const { send } = useSendMessage(ws.sendEvent, ws.subscribe, currentUserId, ws.registerAckedId);
  const { editMessage, deleteMessage } = useMessageActions(ws.sendEvent);
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
      navigateSearchAfterAccept(
        navigate,
        conversationId,
        currentUserRole,
        urlFilter,
      );
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
          typingUser={ws.typingUser}
          onEditMessage={(messageId, content) =>
            editMessage(conversationId, messageId, content)
          }
          onDeleteMessage={(messageId) =>
            deleteMessage(conversationId, messageId)
          }
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
            onTypingStart={() => {
              ws.sendEvent({
                type: "typing:start",
                payload: { conversationId },
              });
            }}
            onTypingStop={() => {
              ws.sendEvent({
                type: "typing:stop",
                payload: { conversationId },
              });
            }}
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
