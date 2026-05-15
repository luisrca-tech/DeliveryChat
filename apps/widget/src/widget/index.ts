(function () {
  const w = globalThis as unknown as {
    DeliveryChat?: { queue?: unknown[]; init?: (o: unknown) => void };
  };
  w.DeliveryChat = w.DeliveryChat ?? { queue: [] };
  if (!w.DeliveryChat.init) {
    w.DeliveryChat.init = function (o: unknown) {
      (w.DeliveryChat!.queue = w.DeliveryChat!.queue ?? []).push(["init", o]);
    };
  }
})();

import { init, destroy } from "@repo/sdk";
import type { InitOptions, DeliveryChatAPI } from "@repo/sdk";

const w = window as unknown as { DeliveryChat?: { queue?: unknown[] } };
const queue = w.DeliveryChat?.queue;
if (Array.isArray(queue)) {
  for (const item of queue) {
    if (Array.isArray(item) && item[0] === "init") {
      init(item[1] as InitOptions);
    }
  }
}

const DeliveryChat: DeliveryChatAPI = {
  init: (opts: InitOptions) => void init(opts),
  destroy,
  queue: [] as unknown[],
};

declare global {
  interface Window {
    DeliveryChat: DeliveryChatAPI;
  }
}

if (typeof window !== "undefined") {
  (window as Window).DeliveryChat = DeliveryChat;
}

export { init, destroy };
