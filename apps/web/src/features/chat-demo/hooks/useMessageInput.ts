import { useState, useCallback } from "react";
import type { RefObject } from "react";
import type { ContentFormat } from "@repo/types";
import type { OptimisticMessage } from "../lib/wsMessageReducer";
import { serializeLexicalJsonToHtml } from "@repo/lexical-utils";

export function useMessageInput(
  wsRef: RefObject<WebSocket | null>,
  selectedId: string | null,
  visitorUserId: string | null,
  onAppend: (msg: OptimisticMessage) => void,
  onRollback: (clientId: string) => void,
) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = useCallback(
    (content: string, contentFormat: ContentFormat) => {
      const trimmed = content.trim();
      if (!trimmed || sending) return;

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setError("Not connected. Please wait and try again.");
        return;
      }

      const clientMessageId = crypto.randomUUID();
      const contentHtml =
        contentFormat === "lexical"
          ? serializeLexicalJsonToHtml(content)
          : null;

      const optimistic: OptimisticMessage = {
        id: clientMessageId,
        clientId: clientMessageId,
        conversationId: selectedId!,
        senderId: visitorUserId ?? clientMessageId,
        content,
        contentFormat,
        contentHtml,
        createdAt: new Date().toISOString(),
        editedAt: null,
        type: "text",
        pending: true,
      };

      onAppend(optimistic);
      setError(null);
      setSending(true);

      try {
        ws.send(
          JSON.stringify({
            type: "message:send",
            payload: {
              conversationId: selectedId,
              content,
              contentFormat,
              clientMessageId,
            },
          }),
        );
      } catch {
        onRollback(clientMessageId);
        setError("Failed to send message. Please try again.");
      } finally {
        setSending(false);
      }
    },
    [sending, wsRef, selectedId, visitorUserId, onAppend, onRollback],
  );

  return { sending, error, handleSend };
}
