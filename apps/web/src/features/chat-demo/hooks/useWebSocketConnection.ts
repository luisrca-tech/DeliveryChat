import { useRef, useState, useEffect, useCallback } from "react";
import type { MutableRefObject } from "react";
import { useWebSocketReconnect } from "./useWebSocketReconnect";
import { useWebSocketHeartbeat } from "./useWebSocketHeartbeat";
import type { ChatClient } from "../chat-client";

type WsStatus = "connecting" | "connected" | "disconnected";

export type UseWebSocketConnectionOptions = {
  selectedId: string | null;
  client: ChatClient;
  getLastMessageId: (conversationId: string) => string | null | undefined;
  onMessageRef: MutableRefObject<(e: MessageEvent) => void>;
  onResetTyping: () => void;
};

export function useWebSocketConnection({
  selectedId,
  client,
  getLastMessageId,
  onMessageRef,
  onResetTyping,
}: UseWebSocketConnectionOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("disconnected");
  const reconnectAttemptRef = useRef(0);
  const conversationClosedRef = useRef(false);

  // Stale-closure guard: always reflects the current selectedId inside the async connect() closure
  // so that a connection established after a conversation switch is immediately discarded.
  const selectedIdRef = useRef<string | null>(null);

  const { scheduleReconnect, cancelReconnect } = useWebSocketReconnect();
  const { startHeartbeat, stopHeartbeat } = useWebSocketHeartbeat();

  const onResetTypingRef = useRef(onResetTyping);
  onResetTypingRef.current = onResetTyping;

  const connectRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;

    wsRef.current?.close();
    wsRef.current = null;
    stopHeartbeat();
    cancelReconnect();
    reconnectAttemptRef.current = 0;
    setWsStatus("disconnected");
    onResetTypingRef.current();

    if (!selectedId) return;

    let cancelled = false;

    async function connect() {
      if (cancelled) return;
      setWsStatus("connecting");

      try {
        const { token } = await client.getWsToken();
        if (cancelled) return;

        const ws = await client.connectWebSocket(token);
        if (cancelled) {
          ws.close();
          return;
        }

        wsRef.current = ws;
        reconnectAttemptRef.current = 0;
        setWsStatus("connected");

        const lastMessageId = getLastMessageId(selectedIdRef.current!) ?? undefined;
        ws.send(
          JSON.stringify({
            type: "room:join",
            payload: {
              conversationId: selectedIdRef.current,
              ...(lastMessageId ? { lastMessageId } : {}),
            },
          }),
        );

        startHeartbeat(wsRef);

        ws.addEventListener("message", (e) => onMessageRef.current(e as MessageEvent));

        ws.addEventListener("close", () => {
          stopHeartbeat();
          if (!cancelled) {
            setWsStatus("disconnected");
            if (!conversationClosedRef.current) {
              scheduleReconnect(reconnectAttemptRef, () => void connect());
            }
          }
        });

        ws.addEventListener("error", () => {
          if (!cancelled) setWsStatus("disconnected");
        });
      } catch {
        if (!cancelled) {
          scheduleReconnect(reconnectAttemptRef, () => void connect());
        }
      }
    }

    connectRef.current = connect;
    void connect();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
      stopHeartbeat();
      cancelReconnect();
    };
  }, [selectedId, client, getLastMessageId, startHeartbeat, stopHeartbeat, scheduleReconnect, cancelReconnect]);

  return {
    wsRef,
    wsStatus,
    conversationClosedRef: conversationClosedRef as MutableRefObject<boolean>,
    selectedIdRef: selectedIdRef as MutableRefObject<string | null>,
  };
}
