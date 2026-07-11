/**
 * Deterministic, pre-LLM detection of a visitor explicitly asking for a human.
 *
 * Intentionally small and conservative: it fires only when the message pairs a
 * "person" noun with a "reach/talk" verb, so ordinary uses of the word "agent"
 * (e.g. "user agent") do not escalate. English + Portuguese are covered because
 * the platform is bilingual. Edit these two lists to tune the phrase surface.
 */
const HUMAN_NOUNS =
  /\b(human|person|people|agent|attendant|representative|operator|someone|somebody|staff|atendente|humano|pessoa|agente|operador|alguem|alguém)\b/i;

const CONTACT_VERBS =
  /\b(talk|speak|chat|connect|reach|contact|transfer|escalate|falar|conversar|atendimento|atender|transferir)\b/i;

export function isHumanRequest(text: string | null | undefined): boolean {
  if (!text) return false;
  return HUMAN_NOUNS.test(text) && CONTACT_VERBS.test(text);
}
