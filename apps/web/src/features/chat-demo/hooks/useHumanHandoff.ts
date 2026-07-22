import { useCallback, useEffect, useState } from "react";
import type { ChatClient, Conversation } from "../chat-client";
import { handoffOffer, type HandoffMessage } from "../lib/handoffOffer";

type UseHumanHandoffArgs = {
  client: ChatClient;
  /** Server-derived AI entitlement, from `useWidgetSettings`. */
  aiEnabled: boolean;
  conversation: Conversation | undefined;
  messages: HandoffMessage[];
  visitorUserId: string | null;
};

type UseHumanHandoff = {
  hidden: boolean;
  disabled: boolean;
  escalating: boolean;
  error: string | null;
  requestHuman: () => void;
};

/**
 * Owns the demo's "Talk to a human" affordance: the one-time AI-entitlement
 * fetch, the per-conversation "already requested" flag, and the escalation
 * call. The visible outcome (the resulting system message, the status flip)
 * arrives through the normal WebSocket message flow — this hook deliberately
 * does not synthesise any local message, so the demo shows the real thing.
 */
export function useHumanHandoff({
  client,
  aiEnabled,
  conversation,
  messages,
  visitorUserId,
}: UseHumanHandoffArgs): UseHumanHandoff {
  const [humanRequested, setHumanRequested] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Already requested" is a property of one conversation, not of the visitor.
  const conversationId = conversation?.id ?? null;
  useEffect(() => {
    setHumanRequested(false);
    setError(null);
  }, [conversationId]);

  const { hidden, disabled } = handoffOffer({
    aiEnabled,
    conversation,
    messages,
    visitorUserId,
    humanRequested,
  });

  const requestHuman = useCallback(() => {
    if (!conversationId || escalating) return;
    setEscalating(true);
    setError(null);
    client
      .escalate(conversationId)
      .then(() => setHumanRequested(true))
      .catch((e: unknown) => {
        setError(
          e instanceof Error
            ? e.message
            : "Could not reach a human right now. Please try again.",
        );
      })
      .finally(() => setEscalating(false));
  }, [client, conversationId, escalating]);

  return {
    hidden,
    disabled: disabled || escalating,
    escalating,
    error,
    requestHuman,
  };
}
