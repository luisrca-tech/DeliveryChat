import { useRef, useCallback } from "react";
import type { RefObject } from "react";

const HEARTBEAT_MS = 30_000;

export function useWebSocketHeartbeat() {
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopHeartbeat = useCallback(() => {
    if (pingRef.current) {
      clearInterval(pingRef.current);
      pingRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback((wsRef: RefObject<WebSocket | null>) => {
    if (pingRef.current) clearInterval(pingRef.current);
    pingRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, HEARTBEAT_MS);
  }, []);

  return { startHeartbeat, stopHeartbeat };
}
