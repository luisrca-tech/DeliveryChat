import { EventEmitter } from "./EventEmitter.js";
import { subscribe, getState } from "./state.js";
import type { SdkEventMap } from "./SdkEventMap.js";
import type { ChatMessage, ConversationStatus } from "./types/index.js";

let cleanupFns: Array<() => void> = [];

export function connectEventBridge(emitter: EventEmitter<SdkEventMap>): void {
  disconnectEventBridge();

  cleanupFns.push(
    subscribe("isOpen", (isOpen: boolean) => {
      emitter.emit(isOpen ? "open" : "close");
    }),
  );

  cleanupFns.push(
    subscribe("unreadCount", (count: number) => {
      emitter.emit("unread:changed", { count });
    }),
  );

  cleanupFns.push(
    subscribe("conversationStatus", (status: ConversationStatus | null) => {
      if (status === "closed") {
        const conversationId = getState("conversationId");
        if (conversationId) {
          emitter.emit("conversation:resolved", { conversationId });
        }
      }
    }),
  );

  let prevConversationId: string | null = null;
  cleanupFns.push(
    subscribe("conversationId", (conversationId: string | null) => {
      if (conversationId && prevConversationId === null) {
        emitter.emit("conversation:started", { conversationId });
      }
      prevConversationId = conversationId;
    }),
  );

  cleanupFns.push(
    subscribe("connectionStatus", (status: string) => {
      if (status === "connected") {
        emitter.emit("ready");
      }
    }),
  );

  const prevMessageMap = new Map<string, ChatMessage>();
  const pendingVisitorIds = new Set<string>();

  cleanupFns.push(
    subscribe("messages", (messages: ChatMessage[]) => {
      const visitorId = getState("visitorId");

      for (const msg of messages) {
        const prev = prevMessageMap.get(msg.id);

        if (!prev) {
          if (msg.senderId === visitorId && msg.status === "sent" && pendingVisitorIds.size > 0) {
            emitter.emit("message:sent", msg);
          } else if (msg.senderId !== visitorId && msg.status === "sent") {
            emitter.emit("message:received", msg);
          }
        }
      }

      pendingVisitorIds.clear();
      prevMessageMap.clear();
      for (const msg of messages) {
        prevMessageMap.set(msg.id, msg);
        if (msg.senderId === visitorId && msg.status === "pending") {
          pendingVisitorIds.add(msg.id);
        }
      }
    }),
  );
}

export function disconnectEventBridge(): void {
  for (const fn of cleanupFns) fn();
  cleanupFns = [];
}
