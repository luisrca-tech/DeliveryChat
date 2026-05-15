import { EventEmitter } from "./EventEmitter.js";
import { subscribe, getState } from "./state.js";
import type { SdkEventMap } from "./SdkEventMap.js";
import type { ConversationStatus } from "./types/index.js";
import { getSdkApi } from "./SdkApi.js";

let cleanupFns: Array<() => void> = [];

export function connectEventBridge(emitter: EventEmitter<SdkEventMap>): void {
  disconnectEventBridge();

  cleanupFns.push(
    subscribe("isOpen", (isOpen: boolean) => {
      if (getSdkApi().isHeadless()) return;
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
}

export function disconnectEventBridge(): void {
  for (const fn of cleanupFns) fn();
  cleanupFns = [];
}
