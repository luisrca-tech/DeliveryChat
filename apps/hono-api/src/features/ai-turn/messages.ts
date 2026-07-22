/**
 * Escalation vocabulary shared across the autonomous AI turn.
 *
 * `EscalationKind` classifies WHY the turn handed off; `escalationMessageFor`
 * maps each kind to the exact visitor-facing system message (mirrors plan §6).
 */
export type EscalationKind =
  | "knowledge_gap"
  | "human_requested"
  | "turn_failed"
  | "quota_exhausted";

export const ESCALATION_KNOWLEDGE_GAP_MESSAGE =
  "I wasn't able to fully answer that, so I'm connecting you with someone from our team. You're in the queue — an operator will be with you shortly.";

export const ESCALATION_HUMAN_REQUESTED_MESSAGE =
  "Sure — connecting you with a team member now. You're in the queue; someone will join shortly.";

/**
 * Visitor-facing copy for an escalation. `turn_failed` and `quota_exhausted`
 * deliberately reuse the knowledge-gap wording — the visitor should never see
 * an internal failure reason.
 */
export function escalationMessageFor(kind: EscalationKind): string {
  return kind === "human_requested"
    ? ESCALATION_HUMAN_REQUESTED_MESSAGE
    : ESCALATION_KNOWLEDGE_GAP_MESSAGE;
}

/** Max length persisted to `conversations.escalation_reason` (varchar 500). */
export const ESCALATION_REASON_MAX_LENGTH = 500;

export function truncateEscalationReason(reason: string): string {
  return reason.slice(0, ESCALATION_REASON_MAX_LENGTH);
}
