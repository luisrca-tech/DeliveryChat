import { useRef, useCallback } from "react";
import type { RefObject } from "react";

const TYPING_DEBOUNCE_MS = 1500;

export function useTypingIndicator(
  wsRef: RefObject<WebSocket | null>,
  selectedId: string | null,
) {
  const isSendingTypingRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendTypingStop = useCallback(() => {
    if (!isSendingTypingRef.current) return;
    isSendingTypingRef.current = false;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN && selectedId) {
      ws.send(
        JSON.stringify({
          type: "typing:stop",
          payload: { conversationId: selectedId },
        }),
      );
    }
  }, [wsRef, selectedId]);

  const notifyTyping = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !selectedId) return;

    if (!isSendingTypingRef.current) {
      isSendingTypingRef.current = true;
      ws.send(
        JSON.stringify({
          type: "typing:start",
          payload: { conversationId: selectedId },
        }),
      );
    }

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(sendTypingStop, TYPING_DEBOUNCE_MS);
  }, [wsRef, selectedId, sendTypingStop]);

  return { notifyTyping, sendTypingStop };
}
