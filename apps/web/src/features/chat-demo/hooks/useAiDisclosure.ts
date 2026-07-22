import { useEffect, useMemo, useRef, useState } from "react";
import type { OptimisticMessage } from "../lib/wsMessageReducer";
import {
  disclosureText,
  shouldSeedDisclosure,
  type DisclosureSettings,
} from "../lib/aiDisclosure";

type UseAiDisclosureArgs = {
  aiEnabled: boolean;
  settings: DisclosureSettings;
  conversationId: string | null;
  messageCount: number;
  loadingMessages: boolean;
};

/**
 * Produces the opening AI-disclosure row for AI-handled conversations, matching
 * the real widget. Purely client-side and never sent to the server — it is a
 * rendering concern, the same way the SDK treats it.
 *
 * Seeded once per conversation and then remembered, so it stays pinned at the
 * top of the thread as messages arrive instead of vanishing after the first
 * reply.
 */
export function useAiDisclosure({
  aiEnabled,
  settings,
  conversationId,
  messageCount,
  loadingMessages,
}: UseAiDisclosureArgs): OptimisticMessage | null {
  // Which conversations have been disclosed. A ref would not re-render on
  // change, so the set lives in state and is replaced, never mutated.
  const [disclosed, setDisclosed] = useState<ReadonlySet<string>>(new Set());

  // Stable per conversation so the row keeps its React key across re-renders.
  const idRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (
      !shouldSeedDisclosure({
        aiEnabled,
        conversationId,
        messageCount,
        loadingMessages,
        alreadySeeded:
          conversationId !== null && disclosed.has(conversationId),
      })
    ) {
      return;
    }
    const id = conversationId as string;
    setDisclosed((prev) => new Set(prev).add(id));
  }, [aiEnabled, conversationId, messageCount, loadingMessages, disclosed]);

  return useMemo(() => {
    if (!conversationId || !disclosed.has(conversationId)) return null;

    idRef.current[conversationId] ??= `ai-disclosure-${crypto.randomUUID()}`;

    return {
      id: idRef.current[conversationId],
      conversationId,
      senderId: "",
      content: disclosureText(settings),
      editedAt: null,
      createdAt: new Date().toISOString(),
      type: "system",
    } satisfies OptimisticMessage;
  }, [conversationId, disclosed, settings]);
}
