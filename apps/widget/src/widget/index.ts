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

import { init, destroy, getSdkApi } from "@repo/sdk";
import type { InitOptions, DeliveryChatAPI } from "@repo/sdk";

const sdkApi = getSdkApi();

const w = window as unknown as { DeliveryChat?: { queue?: unknown[] } };
const queue = w.DeliveryChat?.queue;
if (Array.isArray(queue)) {
  for (const item of queue) {
    if (Array.isArray(item)) {
      const [method, ...args] = item;
      if (method === "init") {
        init(args[0] as InitOptions);
      } else if (method === "on" && typeof args[0] === "string" && typeof args[1] === "function") {
        sdkApi.on(args[0] as keyof import("@repo/sdk").SdkEventMap, args[1]);
      } else if (method === "sendMessage" && typeof args[0] === "string") {
        sdkApi.sendMessage(args[0]);
      } else if (method === "identify" && typeof args[0] === "object" && args[0] !== null) {
        sdkApi.identify(args[0] as import("@repo/sdk").IdentifyParams);
      }
    }
  }
}

const DeliveryChat: DeliveryChatAPI = {
  init: (opts: InitOptions) => void init(opts),
  destroy,
  open: () => sdkApi.open(),
  close: () => sdkApi.close(),
  toggle: () => sdkApi.toggle(),
  hideWidget: () => sdkApi.hideWidget(),
  showWidget: () => sdkApi.showWidget(),
  on: (event, callback) => sdkApi.on(event, callback),
  off: (event, callback) => sdkApi.off(event, callback),
  sendMessage: (text) => sdkApi.sendMessage(text),
  identify: (params) => sdkApi.identify(params),
  getConversation: () => sdkApi.getConversation(),
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
