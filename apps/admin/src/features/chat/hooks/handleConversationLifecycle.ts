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

export type HandleConversationLifecycleDeps = {
  invalidateQueries: () => void;
};

export function handleConversationLifecycle(
  eventType: ConversationLifecycleEventType,
  deps: HandleConversationLifecycleDeps,
): void {
  if (LIFECYCLE_EVENTS.has(eventType)) {
    deps.invalidateQueries();
  }
}
