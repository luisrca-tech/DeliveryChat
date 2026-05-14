import type { WebSocketHandlerContext } from "../types/chat.types";

const LIFECYCLE_EVENTS = new Set([
  "conversation:new",
  "conversation:accepted",
  "conversation:released",
  "conversation:resolved",
]);

export type ConversationLifecycleEventType =
  | "conversation:new"
  | "conversation:accepted"
  | "conversation:released"
  | "conversation:resolved";

export function handleConversationLifecycle(
  eventType: ConversationLifecycleEventType,
  ctx: WebSocketHandlerContext,
): void {
  if (LIFECYCLE_EVENTS.has(eventType)) {
    ctx.invalidateQueries();
  }
}
