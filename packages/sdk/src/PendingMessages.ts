import type { ChatMessage } from "./types/index.js";

const SEND_TIMEOUT_MS = 15_000;

type Resolver = {
  resolve: (msg: ChatMessage) => void;
  reject: (err: Error) => void;
};

const pending = new Map<string, Resolver>();

export function trackPendingMessage(
  clientMessageId: string,
): Promise<ChatMessage> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pending.delete(clientMessageId);
      reject(new Error("[DeliveryChat] Message send timed out"));
    }, SEND_TIMEOUT_MS);

    pending.set(clientMessageId, {
      resolve: (msg) => {
        clearTimeout(timeoutId);
        pending.delete(clientMessageId);
        resolve(msg);
      },
      reject: (err) => {
        clearTimeout(timeoutId);
        pending.delete(clientMessageId);
        reject(err);
      },
    });
  });
}

export function resolvePendingMessage(
  clientMessageId: string,
  msg: ChatMessage,
): void {
  pending.get(clientMessageId)?.resolve(msg);
}

export function rejectPendingMessage(
  clientMessageId: string,
  err: Error,
): void {
  pending.get(clientMessageId)?.reject(err);
}

export function clearAllPending(): void {
  const destroyError = new Error("[DeliveryChat] SDK destroyed");
  for (const [, resolver] of pending) {
    resolver.reject(destroyError);
  }
  pending.clear();
}
