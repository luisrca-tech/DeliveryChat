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

import { init, destroy, getSdkApi } from "@deliverychat/sdk";
import type {
  InitOptions,
  DeliveryChatAPI,
  SdkEventMap,
  IdentifyParams,
} from "@deliverychat/sdk";

const sdkApi = getSdkApi();

const queueHandlers: Record<string, (...args: unknown[]) => void> = {
  init: (opts) => init(opts as InitOptions),
  on: (event, callback) =>
    typeof event === "string" &&
    typeof callback === "function" &&
    sdkApi.on(
      event as keyof SdkEventMap,
      callback as (...args: unknown[]) => void,
    ),
  sendMessage: (text) => typeof text === "string" && sdkApi.sendMessage(text),
  identify: (params) =>
    typeof params === "object" &&
    params !== null &&
    sdkApi.identify(params as IdentifyParams),
};

const w = window as unknown as { DeliveryChat?: { queue?: unknown[] } };
const queue = w.DeliveryChat?.queue;
if (Array.isArray(queue)) {
  for (const item of queue) {
    if (Array.isArray(item)) {
      const [method, ...args] = item;
      queueHandlers[method as string]?.(...args);
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
