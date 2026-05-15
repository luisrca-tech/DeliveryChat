import { EventEmitter } from "./EventEmitter.js";
import { getState, setState } from "./state.js";
import { openChat, sendMessageAsync } from "./chat-controller.js";
import type { SdkEventMap } from "./SdkEventMap.js";
import type { ChatMessage, ConversationSnapshot } from "./types/index.js";

type Listener<T> = (payload: T) => void;

type InitMode = { headless?: boolean };

class SdkApi {
  readonly emitter = new EventEmitter<SdkEventMap>();
  private initialized = false;
  private headless = false;

  markInitialized(mode?: InitMode): void {
    this.initialized = true;
    this.headless = mode?.headless ?? false;
  }

  markDestroyed(): void {
    this.initialized = false;
    this.headless = false;
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
