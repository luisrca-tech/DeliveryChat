import { useState, useCallback } from "react";

export function useVisitorUserId() {
  const [visitorUserId, setVisitorUserId] = useState<string | null>(null);

  const captureVisitorId = useCallback((id: string | null) => {
    if (id === null) return;
    setVisitorUserId((prev) => (prev !== null ? prev : id));
  }, []);

  return { visitorUserId, captureVisitorId };
}
