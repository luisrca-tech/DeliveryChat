import { useRef, useCallback } from "react";
import type { MutableRefObject } from "react";

const BASE_MS = 1_000;
const MAX_MS = 30_000;

export function useWebSocketReconnect() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelReconnect = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(
    (attemptRef: MutableRefObject<number>, connectFn: () => void) => {
      const attempt = attemptRef.current;
      const delay = Math.min(BASE_MS * 2 ** attempt, MAX_MS);
      attemptRef.current = attempt + 1;
      timerRef.current = setTimeout(connectFn, delay);
    },
    [],
  );

  return { scheduleReconnect, cancelReconnect };
}
