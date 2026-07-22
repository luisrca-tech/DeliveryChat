/**
 * Per-conversation in-memory turn lock (debounce + rerun flag).
 *
 * Guarantees at most one autonomous AI turn runs per conversation at a time, so
 * rapid-fire visitor messages can't spawn overlapping double-replies. A
 * debounced call may carry a visitor message that arrived AFTER the running
 * turn loaded its transcript, so it is recorded as a pending rerun;
 * `releaseTurnLock` reports it and the caller runs one more turn to cover the
 * possibly-missed message. In-memory for now; becomes a Redis lock when BullMQ
 * lands.
 */
const activeTurns = new Set<string>();
const pendingReruns = new Set<string>();

export function tryAcquireTurnLock(conversationId: string): boolean {
  if (activeTurns.has(conversationId)) {
    pendingReruns.add(conversationId);
    return false;
  }
  activeTurns.add(conversationId);
  return true;
}

/**
 * Release the lock. Returns true when a call was debounced while this turn ran
 * (a rerun is needed); the flag is consumed so each rerun is scheduled exactly
 * once.
 */
export function releaseTurnLock(conversationId: string): boolean {
  activeTurns.delete(conversationId);
  return pendingReruns.delete(conversationId);
}
