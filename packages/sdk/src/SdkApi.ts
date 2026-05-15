import { EventEmitter } from "./EventEmitter.js";
import { getState, setState } from "./state.js";
import { openChat, sendMessageAsync } from "./chat-controller.js";
import { postIdentify } from "./api.js";
import { getApiBaseUrl } from "./config.js";
import type { SdkEventMap } from "./SdkEventMap.js";
import type { ChatMessage, ConversationSnapshot, IdentifyParams, IdentityResult } from "./types/index.js";

type Listener<T> = (payload: T) => void;

type InitMode = { headless?: boolean; appId?: string };

class SdkApi {
  readonly emitter = new EventEmitter<SdkEventMap>();
  private initialized = false;
  private headless = false;
  private appId: string | null = null;

  markInitialized(mode?: InitMode): void {
    this.initialized = true;
    this.headless = mode?.headless ?? false;
    this.appId = mode?.appId ?? null;
  }

  markDestroyed(): void {
    this.initialized = false;
    this.headless = false;
    this.appId = null;
    this.emitter.removeAllListeners();
  }

  isHeadless(): boolean {
    return this.headless;
  }

  private requireInit(): void {
    if (!this.initialized) {
      throw new Error("[DeliveryChat] SDK not initialized. Call init() first.");
    }
  }

  open(): void {
    this.requireInit();
    if (this.headless) return;
    setState("isOpen", true);
    openChat();
  }

  close(): void {
    this.requireInit();
    if (this.headless) return;
    setState("isOpen", false);
  }

  toggle(): void {
    this.requireInit();
    if (this.headless) return;
    const isOpen = getState("isOpen");
    if (isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  hideWidget(): void {
    this.requireInit();
    if (this.headless) return;
    setState("widgetVisible", false);
  }

  showWidget(): void {
    this.requireInit();
    if (this.headless) return;
    setState("widgetVisible", true);
  }

  async sendMessage(text: string): Promise<ChatMessage> {
    this.requireInit();
    return sendMessageAsync(text);
  }

  async identify(params: IdentifyParams): Promise<IdentityResult> {
    this.requireInit();
    if (!this.appId) {
      throw new Error("[DeliveryChat] appId not available. Was init() called?");
    }
    const visitorId = getState("visitorId");
    if (!visitorId) {
      throw new Error("[DeliveryChat] visitorId not available. Was init() called?");
    }
    return postIdentify(getApiBaseUrl(), this.appId, visitorId, params);
  }

  getConversation(): ConversationSnapshot | null {
    this.requireInit();
    const id = getState("conversationId");
    if (!id) return null;
    const status = getState("conversationStatus");
    const messages = getState("messages");
    return { id, status: status ?? "pending", messages };
  }

  on<K extends keyof SdkEventMap>(event: K, callback: Listener<SdkEventMap[K]>): void {
    this.emitter.on(event, callback);
  }

  off<K extends keyof SdkEventMap>(event: K, callback: Listener<SdkEventMap[K]>): void {
    this.emitter.off(event, callback);
  }
}

let instance: SdkApi | null = null;

export function getSdkApi(): SdkApi {
  if (!instance) {
    instance = new SdkApi();
  }
  return instance;
}

export function resetSdkApi(): void {
  if (instance) {
    instance.markDestroyed();
  }
  instance = null;
}
