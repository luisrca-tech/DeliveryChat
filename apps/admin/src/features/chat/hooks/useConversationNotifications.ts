import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { WSServerEvent } from "@repo/types";

type SubscribeFn = (handler: (event: WSServerEvent) => void) => () => void;

export function useConversationNotifications(
  subscribe: SubscribeFn,
  selectedConversationId: string | null,
  onNavigate: (conversationId: string) => void,
  sessionUserId: string,
) {
  const selectedRef = useRef(selectedConversationId);
  const navigateRef = useRef(onNavigate);
  const userIdRef = useRef(sessionUserId);

  useEffect(() => {
    selectedRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    navigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    userIdRef.current = sessionUserId;
  }, [sessionUserId]);

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === "conversation:new") {
        const payload = event.payload;
        toast.info("New conversation", {
          description: payload.subject ?? "Conversation created",
        });
      }

      if (event.type === "message:new") {
        const msg = event.payload;
        const isAssignedToMe = msg.assignedTo === userIdRef.current;
        if (
          msg.senderRole === "visitor" &&
          msg.conversationId !== selectedRef.current &&
          isAssignedToMe
        ) {
          const convId = msg.conversationId;
          toast.info("New message", {
            description: msg.content.slice(0, 80),
            action: {
              label: "Open",
              onClick: () => navigateRef.current(convId),
            },
          });
        }
      }
    });

    return unsubscribe;
  }, [subscribe]);
}
