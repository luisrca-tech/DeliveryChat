/**
 * Per-conversation in-memory turn lock (debounce).
 *
 * Guarantees at most one autonomous AI turn runs per conversation at a time, so
 * rapid-fire visitor messages can't spawn overlapping double-replies. The
 * running turn always reads the latest messages, so a debounced (dropped) call
 * loses nothing. In-memory for now; becomes a Redis lock when BullMQ lands.
 */
const activeTurns = new Set<string>();

export function tryAcquireTurnLock(conversationId: string): boolean {
  if (activeTurns.has(conversationId)) return false;
  activeTurns.add(conversationId);
  return true;
}

export function releaseTurnLock(conversationId: string): void {
  activeTurns.delete(conversationId);
}
