import { EventEmitter } from "./EventEmitter.js";
import { getState, setState } from "./state.js";
import { postIdentify } from "./api.js";
import { getApiBaseUrl } from "./config.js";
import { getOrCreateVisitorId } from "./visitor.js";
import {
  getConversationMessages,
  getUnreadCount,
  markConversationAsRead,
} from "./conversation.js";
import {
  connectWS,
  disconnectWS,
  sendWSMessage,
  getMessagePipeline,
} from "./ws.js";
import {
  setActiveAppIdForPersistence,
  loadPersistedConversationId,
  removeAllConversationKeysForApp,
} from "./conversation-persistence.js";
import { TYPING_THROTTLE_MS } from "./constants/index.js";
import type { SdkEventMap } from "./SdkEventMap.js";
import type {
  ChatMessage,
  ConversationSnapshot,
  IdentifyParams,
  IdentityResult,
} from "./types/index.js";

type Listener<T> = (payload: T) => void;

type InitMode = { headless?: boolean; appId?: string };

class SdkApi {
  readonly emitter = new EventEmitter<SdkEventMap>();
  private initialized = false;
  private headless = false;
  private appId: string | null = null;
  private chatInitialized = false;
  private lastTypingSent = 0;

  markInitialized(mode?: InitMode): void {
    this.initialized = true;
    this.headless = mode?.headless ?? false;
    this.appId = mode?.appId ?? null;
  }

  markDestroyed(): void {
    this.initialized = false;
    this.headless = false;
    this.appId = null;
    this.chatInitialized = false;
    this.lastTypingSent = 0;
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

  // ── Public API methods ──

  open(): void {
    this.requireInit();
    if (this.headless) return;
    setState("isOpen", true);
    this.openChat();
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

    if (!this.chatInitialized || !this.appId) {
      throw new Error("[DeliveryChat] SDK not initialized. Call init() first.");
    }

    const pipeline = getMessagePipeline();
    if (!pipeline) {
      throw new Error("[DeliveryChat] WebSocket not initialized.");
    }

    const result = await pipeline.send(text, {
      appId: this.appId,
      apiBaseUrl: getApiBaseUrl(),
    });
    this.lastTypingSent = 0;
    return result;
  }

  async identify(params: IdentifyParams): Promise<IdentityResult> {
    this.requireInit();
    if (!this.appId) {
      throw new Error("[DeliveryChat] appId not available. Was init() called?");
    }
    const visitorId = getState("visitorId");
    if (!visitorId) {
      throw new Error(
        "[DeliveryChat] visitorId not available. Was init() called?",
      );
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

  on<K extends keyof SdkEventMap>(
    event: K,
    callback: Listener<SdkEventMap[K]>,
  ): void {
    this.emitter.on(event, callback);
  }

  off<K extends keyof SdkEventMap>(
    event: K,
    callback: Listener<SdkEventMap[K]>,
  ): void {
    this.emitter.off(event, callback);
  }

  // ── Chat orchestration methods ──

  async initChat(opts: { appId: string }): Promise<void> {
    this.appId = opts.appId;

    const visitorId = getOrCreateVisitorId();
    setState("visitorId", visitorId);

    setActiveAppIdForPersistence(opts.appId);
    const savedConvId = loadPersistedConversationId(opts.appId);
    if (savedConvId) {
      setState("conversationId", savedConvId);
      await this.restoreConversationHistory(opts.appId, savedConvId);
      connectWS({ apiBaseUrl: getApiBaseUrl(), appId: opts.appId, visitorId });
    }

    this.chatInitialized = true;
  }

  openChat(): void {
    if (!this.chatInitialized || !this.appId) return;

    const visitorId = getState("visitorId");
    if (!visitorId) return;

    setState("unreadCount", 0);

    const conversationId = getState("conversationId");
    if (conversationId) {
      markConversationAsRead(
        getApiBaseUrl(),
        this.appId,
        conversationId,
        visitorId,
      ).catch(() => {});
    }

    if (getState("connectionStatus") === "disconnected") {
      connectWS({
        apiBaseUrl: getApiBaseUrl(),
        appId: this.appId,
        visitorId,
      });
    }
  }

  editMessage(messageId: string, newContent: string): void {
    if (!this.chatInitialized || !this.appId) return;
    const conversationId = getState("conversationId");
    if (!conversationId) return;

    setState("messages", (prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? { ...msg, content: newContent, editedAt: new Date().toISOString() }
          : msg,
      ),
    );
    setState("editingMessageId", null);

    sendWSMessage({
      type: "message:edit",
      payload: { conversationId, messageId, content: newContent },
    });
  }

  deleteMessage(messageId: string): void {
    if (!this.chatInitialized || !this.appId) return;
    const conversationId = getState("conversationId");
    if (!conversationId) return;

    setState("messages", (prev) =>
      prev.map((msg) =>
        msg.id === messageId ? { ...msg, isDeleted: true, content: "" } : msg,
      ),
    );

    sendWSMessage({
      type: "message:delete",
      payload: { conversationId, messageId },
    });
  }

  notifyTypingStart(): void {
    const conversationId = getState("conversationId");
    if (!conversationId || !this.chatInitialized) return;

    const now = Date.now();
    if (now - this.lastTypingSent < TYPING_THROTTLE_MS) return;
    this.lastTypingSent = now;

    sendWSMessage({
      type: "typing:start",
      payload: { conversationId },
    });
  }

  notifyTypingStop(): void {
    const conversationId = getState("conversationId");
    if (!conversationId || !this.chatInitialized) return;

    this.lastTypingSent = 0;
    sendWSMessage({
      type: "typing:stop",
      payload: { conversationId },
    });
  }

  startNewChat(): void {
    if (!this.chatInitialized || !this.appId) return;

    removeAllConversationKeysForApp(this.appId);

    setState("conversationId", null);
    setState("conversationStatus", null);
    setState("messages", []);
    setState("typingUser", null);
    setState("unreadCount", 0);
    this.lastTypingSent = 0;
  }

  connectEagerly(): void {
    if (!this.chatInitialized || !this.appId) return;
    const visitorId = getState("visitorId");
    if (!visitorId) return;
    if (getState("connectionStatus") !== "disconnected") return;

    connectWS({ apiBaseUrl: getApiBaseUrl(), appId: this.appId, visitorId });
  }

  destroyChat(): void {
    getMessagePipeline()?.clearAllPending();
    disconnectWS();

    const currentAppId = this.appId;
    if (currentAppId) {
      removeAllConversationKeysForApp(currentAppId);
    }
    setActiveAppIdForPersistence(null);

    setState("conversationId", null);
    setState("conversationStatus", null);
    setState("messages", []);
    setState("unreadCount", 0);

    this.lastTypingSent = 0;
    this.chatInitialized = false;
  }

  // ── Private helpers ──

  private async restoreConversationHistory(
    currentAppId: string,
    conversationId: string,
  ): Promise<void> {
    try {
      const result = await getConversationMessages(
        getApiBaseUrl(),
        currentAppId,
        conversationId,
      );

      const restored: ChatMessage[] = result.messages
        .map((m) => ({
          id: m.id,
          content: m.content,
          type: (m.type === "system"
            ? "system"
            : "text") as ChatMessage["type"],
          senderRole:
            m.type === "system"
              ? ("operator" as const)
              : this.resolveSenderRole(m.senderId),
          senderId: m.senderId ?? "",
          status: "sent" as const,
          createdAt: m.createdAt,
          editedAt: (m as { editedAt?: string | null }).editedAt ?? null,
        }))
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

      setState("messages", restored);

      const visitorId = getState("visitorId");
      if (visitorId) {
        getUnreadCount(getApiBaseUrl(), currentAppId, conversationId, visitorId)
          .then((count) => setState("unreadCount", count))
          .catch(() => {});
      }
    } catch (error) {
      const is404 = error instanceof Error && error.message.includes("404");
      if (is404) {
        removeAllConversationKeysForApp(currentAppId);
        setState("conversationId", null);
        setState("conversationStatus", null);
      }
    }
  }

  private resolveSenderRole(senderId: string): ChatMessage["senderRole"] {
    const visitorId = getState("visitorId");
    return senderId === visitorId ? "visitor" : "operator";
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
