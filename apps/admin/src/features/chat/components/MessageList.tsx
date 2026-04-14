import { useEffect, useRef } from "react";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "../types/chat.types";
import type { TypingUser } from "../hooks/useWebSocket";

type Props = {
  messages: Message[];
  isLoading: boolean;
  currentUserId: string;
  typingUser: TypingUser;
  onEditMessage?: (messageId: string, content: string) => void;
  onDeleteMessage?: (messageId: string) => void;
};

export function MessageList({
  messages,
  isLoading,
  currentUserId,
  typingUser,
  onEditMessage,
  onDeleteMessage,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(messages.length);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = messages.length;
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading messages...</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          No messages yet. Start the conversation!
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-3">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isSelf={msg.senderId === currentUserId}
            onEdit={onEditMessage}
            onDelete={onDeleteMessage}
          />
        ))}
        {typingUser && (
          <div className="px-1 py-1">
            <p className="text-xs text-muted-foreground italic">
              {typingUser.senderRole === "visitor"
                ? "Visitor is typing..."
                : `${typingUser.userName ?? "Agent"} is typing...`}
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
