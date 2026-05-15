import { EventEmitter } from "./EventEmitter.js";
import { getState, setState } from "./state.js";
import { openChat } from "./chat-controller.js";
import type { SdkEventMap } from "./SdkEventMap.js";

type Listener<T> = (payload: T) => void;

class SdkApi {
  readonly emitter = new EventEmitter<SdkEventMap>();
  private initialized = false;

  markInitialized(): void {
    this.initialized = true;
  }

  markDestroyed(): void {
    this.initialized = false;
    this.emitter.removeAllListeners();
  }

  private requireInit(): void {
    if (!this.initialized) {
      throw new Error("[DeliveryChat] SDK not initialized. Call init() first.");
    }
  }

  open(): void {
    this.requireInit();
    setState("isOpen", true);
    openChat();
  }

  close(): void {
    this.requireInit();
    setState("isOpen", false);
  }

  toggle(): void {
    this.requireInit();
    const isOpen = getState("isOpen");
    if (isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  hideWidget(): void {
    this.requireInit();
    setState("widgetVisible", false);
  }

  showWidget(): void {
    this.requireInit();
    setState("widgetVisible", true);
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
