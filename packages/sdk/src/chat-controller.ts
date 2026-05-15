import { getState, setState } from "./state.js";
import { getApiBaseUrl } from "./config.js";
import { getOrCreateVisitorId } from "./visitor.js";
import {
  getConversationMessages,
  getUnreadCount,
  markConversationAsRead,
} from "./conversation.js";
import { connectWS, disconnectWS, sendWSMessage, getMessagePipeline } from "./ws.js";
import type { ChatMessage } from "./types/index.js";
import {
  setActiveAppIdForPersistence,
  loadPersistedConversationId,
  removeAllConversationKeysForApp,
} from "./conversation-persistence.js";
import { TYPING_THROTTLE_MS } from "./constants/index.js";

let appId: string | null = null;
let initialized = false;
let lastTypingSent = 0;

export async function initChatController(opts: { appId: string }): Promise<void> {
  appId = opts.appId;

  const visitorId = getOrCreateVisitorId();
  setState("visitorId", visitorId);

  setActiveAppIdForPersistence(appId);
  const savedConvId = loadPersistedConversationId(appId);
  if (savedConvId) {
    setState("conversationId", savedConvId);
    await restoreConversationHistory(appId, savedConvId);

    connectWS({ apiBaseUrl: getApiBaseUrl(), appId, visitorId });
  }

  initialized = true;
}

async function restoreConversationHistory(
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
        type: (m.type === "system" ? "system" : "text") as ChatMessage["type"],
        senderRole: m.type === "system" ? ("operator" as const) : resolveSenderRole(m.senderId),
        senderId: m.senderId ?? "",
        status: "sent" as const,
        createdAt: m.createdAt,
        editedAt: (m as { editedAt?: string | null }).editedAt ?? null,
      }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

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

function resolveSenderRole(senderId: string): ChatMessage["senderRole"] {
  const visitorId = getState("visitorId");
  return senderId === visitorId ? "visitor" : "operator";
}

export function openChat(): void {
  if (!initialized || !appId) return;

  const visitorId = getState("visitorId");
  if (!visitorId) return;

  setState("unreadCount", 0);

  const conversationId = getState("conversationId");
  if (conversationId) {
    markConversationAsRead(getApiBaseUrl(), appId, conversationId, visitorId)
      .catch(() => {});
  }

  // Connect WS lazily when chat opens
  if (getState("connectionStatus") === "disconnected") {
    connectWS({
      apiBaseUrl: getApiBaseUrl(),
      appId,
      visitorId,
    });
  }
}

export function closeChat(): void {
  // Keep WS alive in background for incoming messages
}

export async function sendMessage(content: string): Promise<void> {
  if (!initialized || !appId) return;

  const pipeline = getMessagePipeline();
  if (!pipeline) return;

  try {
    await pipeline.send(content, { appId, apiBaseUrl: getApiBaseUrl() });
  } catch {
    // Fire-and-forget — errors are reflected in message status
  }
  lastTypingSent = 0;
}

export function editMessage(messageId: string, newContent: string): void {
  if (!initialized || !appId) return;
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

export function deleteMessage(messageId: string): void {
  if (!initialized || !appId) return;
  const conversationId = getState("conversationId");
  if (!conversationId) return;

  setState("messages", (prev) =>
    prev.map((msg) =>
      msg.id === messageId
        ? { ...msg, isDeleted: true, content: "" }
        : msg,
    ),
  );

  sendWSMessage({
    type: "message:delete",
    payload: { conversationId, messageId },
  });
}

export function notifyTypingStart(): void {
  const conversationId = getState("conversationId");
  if (!conversationId || !initialized) return;

  const now = Date.now();
  if (now - lastTypingSent < TYPING_THROTTLE_MS) return;
  lastTypingSent = now;

  sendWSMessage({
    type: "typing:start",
    payload: { conversationId },
  });
}

export function notifyTypingStop(): void {
  const conversationId = getState("conversationId");
  if (!conversationId || !initialized) return;

  lastTypingSent = 0;
  sendWSMessage({
    type: "typing:stop",
    payload: { conversationId },
  });
}

export function startNewChat(): void {
  if (!initialized || !appId) return;

  removeAllConversationKeysForApp(appId);

  setState("conversationId", null);
  setState("conversationStatus", null);
  setState("messages", []);
  setState("typingUser", null);
  setState("unreadCount", 0);
  lastTypingSent = 0;
}

export async function sendMessageAsync(content: string): Promise<ChatMessage> {
  if (!initialized || !appId) {
    throw new Error("[DeliveryChat] SDK not initialized. Call init() first.");
  }

  const pipeline = getMessagePipeline();
  if (!pipeline) {
    throw new Error("[DeliveryChat] WebSocket not initialized.");
  }

  const result = await pipeline.send(content, { appId, apiBaseUrl: getApiBaseUrl() });
  lastTypingSent = 0;
  return result;
}

export function connectEagerly(): void {
  if (!initialized || !appId) return;
  const visitorId = getState("visitorId");
  if (!visitorId) return;
  if (getState("connectionStatus") !== "disconnected") return;

  connectWS({ apiBaseUrl: getApiBaseUrl(), appId, visitorId });
}

export function destroyChat(): void {
  getMessagePipeline()?.clearAllPending();
  disconnectWS();

  const currentAppId = appId;
  if (currentAppId) {
    removeAllConversationKeysForApp(currentAppId);
  }
  setActiveAppIdForPersistence(null);

  setState("conversationId", null);
  setState("conversationStatus", null);
  setState("messages", []);
  setState("unreadCount", 0);

  lastTypingSent = 0;
  initialized = false;
  appId = null;
}
