import { getState, setState } from "./state.js";
import { getApiBaseUrl } from "./config.js";
import { getOrCreateVisitorId } from "./visitor.js";
import { createConversation } from "./conversation.js";
import { connectWS, disconnectWS, sendWSMessage } from "./ws.js";
import type { ChatMessage } from "./types.js";

const CONV_STORAGE_PREFIX = "dc_conv_";
const LAST_MSG_STORAGE_PREFIX = "dc_lastmsg_";

let appId: string | null = null;
let apiKey: string | null = null;
let initialized = false;

export function initChatController(opts: { appId: string; apiKey: string }): void {
  appId = opts.appId;
  apiKey = opts.apiKey;

  const visitorId = getOrCreateVisitorId();
  setState("visitorId", visitorId);

  // Restore conversation from localStorage
  const savedConvId = loadFromStorage(`${CONV_STORAGE_PREFIX}${appId}`);
  if (savedConvId) {
    setState("conversationId", savedConvId);
  }

  initialized = true;
}

export function openChat(): void {
  if (!initialized || !appId || !apiKey) return;

  const visitorId = getState("visitorId");
  if (!visitorId) return;

  // Connect WS lazily when chat opens
  if (getState("connectionStatus") === "disconnected") {
    connectWS({
      apiBaseUrl: getApiBaseUrl(),
      apiKey,
      appId,
      visitorId,
    });
  }
}

export function closeChat(): void {
  // Keep WS alive in background for incoming messages
}

export async function sendMessage(content: string): Promise<void> {
  if (!initialized || !appId || !apiKey) return;

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
        apiKey,
        appId,
        visitorId,
      );
      conversationId = result.conversation.id;
      setState("conversationId", conversationId);
      setState("conversationStatus", "pending");
      saveToStorage(`${CONV_STORAGE_PREFIX}${appId}`, conversationId);

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

  // Track last message for reconnection
  saveToStorage(`${LAST_MSG_STORAGE_PREFIX}${appId}`, clientMessageId);
}

export function destroyChat(): void {
  disconnectWS();

  const currentAppId = appId;
  if (currentAppId) {
    try {
      localStorage.removeItem(`${CONV_STORAGE_PREFIX}${currentAppId}`);
      localStorage.removeItem(`${LAST_MSG_STORAGE_PREFIX}${currentAppId}`);
    } catch {
      // Ignore
    }
  }

  setState("conversationId", null);
  setState("conversationStatus", null);
  setState("messages", []);

  initialized = false;
  appId = null;
  apiKey = null;
}

function loadFromStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function saveToStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore
  }
}
