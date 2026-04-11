import { getState, setState } from "./state.js";
import { getApiBaseUrl } from "./config.js";
import { getOrCreateVisitorId } from "./visitor.js";
import { createConversation } from "./conversation.js";
import { connectWS, disconnectWS, sendWSMessage } from "./ws.js";
import type { ChatMessage } from "./types.js";
import {
  setActiveAppIdForPersistence,
  loadPersistedConversationId,
  saveConversationId,
  saveLastClientMessageId,
  removeAllConversationKeysForApp,
} from "./conversation-persistence.js";

let appId: string | null = null;
let initialized = false;
let lastTypingSent = 0;
const TYPING_THROTTLE_MS = 2_000;

export function initChatController(opts: { appId: string }): void {
  appId = opts.appId;

  const visitorId = getOrCreateVisitorId();
  setState("visitorId", visitorId);

  setActiveAppIdForPersistence(appId);
  const savedConvId = loadPersistedConversationId(appId);
  if (savedConvId) {
    setState("conversationId", savedConvId);
  }

  initialized = true;
}

export function openChat(): void {
  if (!initialized || !appId) return;

  const visitorId = getState("visitorId");
  if (!visitorId) return;

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

  const visitorId = getState("visitorId");
  if (!visitorId) return;

  const clientMessageId = crypto.randomUUID();

  // Optimistic message
  const optimistic: ChatMessage = {
    id: clientMessageId,
    content,
    senderRole: "visitor",
    senderId: visitorId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  setState("messages", (prev) => [...prev, optimistic]);

  // Create conversation on first message
  let conversationId = getState("conversationId");
  if (!conversationId) {
    try {
      const result = await createConversation(
        getApiBaseUrl(),
        appId,
        visitorId,
      );
      conversationId = result.conversation.id;
      setState("conversationId", conversationId);
      setState("conversationStatus", "pending");
      saveConversationId(appId, conversationId);

      // Join the room
      sendWSMessage({
        type: "room:join",
        payload: { conversationId },
      });
    } catch (err) {
      // Mark message as failed
      setState("messages", (prev) =>
        prev.map((m) =>
          m.id === clientMessageId ? { ...m, status: "failed" as const } : m,
        ),
      );
      console.error("[DeliveryChat] Failed to create conversation:", err);
      return;
    }
  }

  // Send via WebSocket
  sendWSMessage({
    type: "message:send",
    payload: { conversationId, content, clientMessageId },
  });

  lastTypingSent = 0;

  // Track last message for reconnection
  saveLastClientMessageId(appId, clientMessageId);
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

export function destroyChat(): void {
  disconnectWS();

  const currentAppId = appId;
  if (currentAppId) {
    removeAllConversationKeysForApp(currentAppId);
  }
  setActiveAppIdForPersistence(null);

  setState("conversationId", null);
  setState("conversationStatus", null);
  setState("messages", []);

  lastTypingSent = 0;
  initialized = false;
  appId = null;
}
