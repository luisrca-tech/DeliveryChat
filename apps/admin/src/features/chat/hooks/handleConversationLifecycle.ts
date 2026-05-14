import type { WebSocketHandlerContext } from "../types/chat.types";

export const LIFECYCLE_EVENTS = new Set([
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
  _eventType: ConversationLifecycleEventType,
  ctx: WebSocketHandlerContext,
): void {
  ctx.invalidateQueries();
}
