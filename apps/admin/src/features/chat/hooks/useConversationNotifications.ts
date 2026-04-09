import { useEffect } from "react";
import { toast } from "sonner";
import type { WSServerEvent } from "@repo/types";

type SubscribeFn = (handler: (event: WSServerEvent) => void) => () => void;

export function useConversationNotifications(subscribe: SubscribeFn) {
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === "conversation:new") {
        const payload = event.payload;
        toast.info("New conversation", {
          description: payload.subject ?? "Conversation created",
        });
      }
    });

    return unsubscribe;
  }, [subscribe]);
}
