import { useState, useCallback } from "react";
import type { RefObject } from "react";
import type { OptimisticMessage } from "../lib/wsMessageReducer";

export function useMessageInput(
  wsRef: RefObject<WebSocket | null>,
  selectedId: string | null,
  visitorUserId: string | null,
  onAppend: (msg: OptimisticMessage) => void,
  onRollback: (clientId: string) => void,
) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  }, []);

  const handleSend = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const content = value.trim();
      if (!content || sending) return;

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setError("Not connected. Please wait and try again.");
        return;
      }

      const clientMessageId = crypto.randomUUID();
      const optimistic: OptimisticMessage = {
        id: clientMessageId,
        clientId: clientMessageId,
        conversationId: selectedId!,
        senderId: visitorUserId ?? clientMessageId,
        content,
        createdAt: new Date().toISOString(),
        editedAt: null,
        type: "text",
        pending: true,
      };

      onAppend(optimistic);
      setValue("");
      setError(null);
      setSending(true);

      try {
        ws.send(
          JSON.stringify({
            type: "message:send",
            payload: { conversationId: selectedId, content, clientMessageId },
          }),
        );
      } catch {
        onRollback(clientMessageId);
        setError("Failed to send message. Please try again.");
      } finally {
        setSending(false);
      }
    },
    [value, sending, wsRef, selectedId, visitorUserId, onAppend, onRollback],
  );

  return { value, sending, error, handleInputChange, handleSend };
}
