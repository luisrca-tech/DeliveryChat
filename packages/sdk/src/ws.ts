import { setState, getState } from "./state.js";
import type { ConnectionError, ChatMessage } from "./types/index.js";
import { clearStaleConversationPersistence } from "./conversation-persistence.js";
import { resolvePendingMessage, rejectPendingMessage } from "./PendingMessages.js";
import { fetchWsToken } from "./api.js";
import {
  PING_INTERVAL,
  RECONNECT_BASE_DELAY,
  RECONNECT_MAX_DELAY,
  WS_TYPING_TIMEOUT_MS,
  RECONNECT_WARN_THRESHOLD,
  PERMANENT_ERROR_CODES,
  PERMANENT_CLOSE_CODES,
} from "./constants/index.js";

type WSConfig = {
  apiBaseUrl: string;
  appId: string;
  visitorId: string;
};

let ws: WebSocket | null = null;
let config: WSConfig | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let typingTimer: ReturnType<typeof setTimeout> | null = null;
let rateLimitTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let intentionalClose = false;
let lastServerErrorCode: string | null = null;

function clearTypingState() {
  setState("typingUser", null);
  if (typingTimer) {
    clearTimeout(typingTimer);
    typingTimer = null;
  }
}

export function connectWS(cfg: WSConfig): void {
  if (ws || reconnectTimer) {
    intentionalClose = true;
    cleanup();
  }
  intentionalClose = false;
  reconnectAttempts = 0;
  lastServerErrorCode = null;
  config = cfg;
  setState("connectionStatus", "connecting");
  setState("connectionError", null);
  createConnection();
}

export function disconnectWS(): void {
  intentionalClose = true;
  cleanup();
  setState("connectionStatus", "disconnected");
}

export function sendWSMessage(event: object): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(event));
}

function buildWsUrl(baseUrl: string, token: string): string {
  const protocol = baseUrl.startsWith("https") ? "wss" : "ws";
  const host = baseUrl.replace(/^https?:\/\//, "");
  return `${protocol}://${host}/api/v1/ws?token=${encodeURIComponent(token)}`;
}

async function createConnection(): Promise<void> {
  if (!config) return;

  try {
    const token = await fetchWsToken(config.apiBaseUrl, config.appId, config.visitorId);
    if (intentionalClose || !config) return;

    ws = new WebSocket(buildWsUrl(config.apiBaseUrl, token));

    ws.onopen = () => {
      reconnectAttempts = 0;
      lastServerErrorCode = null;
      setState("connectionStatus", "connected");
      setState("connectionError", null);
      startPing();

      const convId = getState("conversationId");
      if (convId) {
        const lastMsg = getState("messages").at(-1);
        sendWSMessage({
          type: "room:join",
          payload: {
            conversationId: convId,
            ...(lastMsg?.status === "sent" ? { lastMessageId: lastMsg.id } : {}),
          },
        });
      }
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        handleServerEvent(parsed);
      } catch {
        // Ignore non-JSON
      }
    };

    ws.onclose = (event) => {
      setState("connectionStatus", "disconnected");
      stopPing();

      if (intentionalClose) return;

      const closeCode = (event as CloseEvent)?.code;
      const isPermanent =
        (lastServerErrorCode && PERMANENT_ERROR_CODES.has(lastServerErrorCode)) ||
        (closeCode !== undefined && PERMANENT_CLOSE_CODES.has(closeCode));

      if (isPermanent) {
        const errorCode = lastServerErrorCode ?? `close_${closeCode}`;
        const error: ConnectionError = {
          type: "permanent",
          userMessage: "Chat is temporarily unavailable",
          devMessage: `[DeliveryChat] Connection failed: ${errorCode}. Check that your appId is valid and the application exists.`,
        };
        setState("connectionError", error);
        console.error(error.devMessage);
        return;
      }

      reconnectAttempts++;
      if (reconnectAttempts >= RECONNECT_WARN_THRESHOLD) {
        const error: ConnectionError = {
          type: "temporary",
          userMessage: "Connection lost. Retrying...",
          devMessage: `[DeliveryChat] Connection lost after ${reconnectAttempts} attempts. Still retrying...`,
        };
        setState("connectionError", error);
        console.warn(error.devMessage);
      }

      scheduleReconnect();
    };

    ws.onerror = () => {
    };
  } catch {
    scheduleReconnect();
  }
}

function handleServerEvent(event: { type: string; payload?: unknown }): void {
  switch (event.type) {
    case "message:new": {
      const payload = event.payload as {
        id: string;
        conversationId: string;
        senderId: string | null;
        senderRole: "visitor" | "operator" | "admin";
        content: string;
        type?: string;
        createdAt: string;
        editedAt?: string | null;
      };

      if (payload.conversationId !== getState("conversationId")) break;

      const msgType = payload.type === "system" ? "system" : "text";
      const newMsg: ChatMessage = {
        id: payload.id,
        content: payload.content,
        type: msgType,
        senderRole: payload.senderRole,
        senderId: payload.senderId ?? "",
        status: "sent",
        createdAt: payload.createdAt,
        editedAt: payload.editedAt ?? null,
      };

      let wasDuplicate = false;
      setState("messages", (prev) => {
        if (prev.some((m) => m.id === newMsg.id)) {
          wasDuplicate = true;
          return prev;
        }
        return [...prev, newMsg];
      });

      if (!wasDuplicate && payload.senderRole !== "visitor" && !getState("isOpen")) {
        setState("unreadCount", (prev) => prev + 1);
      }

      if (payload.senderId === getState("typingUser")?.userId) {
        clearTypingState();
      }
      break;
    }

    case "typing:start": {
      const payload = event.payload as {
        conversationId: string;
        userId: string;
        userName: string | null;
        senderRole: string;
      };
      setState("typingUser", {
        userId: payload.userId,
        userName: payload.userName,
        senderRole: payload.senderRole,
      });
      if (typingTimer) clearTimeout(typingTimer);
      typingTimer = setTimeout(() => setState("typingUser", null), WS_TYPING_TIMEOUT_MS);
      break;
    }

    case "typing:stop": {
      const payload = event.payload as { conversationId: string; userId: string };
      const current = getState("typingUser");
      if (current?.userId === payload.userId) {
        clearTypingState();
      }
      break;
    }

    case "message:ack": {
      const payload = event.payload as {
        clientMessageId: string;
        serverMessageId: string;
        createdAt: string;
      };

      let ackedMsg: ChatMessage | undefined;
      setState("messages", (prev) =>
        prev.map((msg) => {
          if (msg.id === payload.clientMessageId) {
            ackedMsg = {
              ...msg,
              id: payload.serverMessageId,
              status: "sent" as const,
              createdAt: payload.createdAt,
            };
            return ackedMsg;
          }
          return msg;
        }),
      );

      if (ackedMsg) {
        resolvePendingMessage(payload.clientMessageId, ackedMsg);
      }
      break;
    }

    case "message:edited": {
      const payload = event.payload as {
        conversationId: string;
        messageId: string;
        content: string;
        editedAt: string;
        senderId: string;
      };

      if (payload.conversationId !== getState("conversationId")) break;

      setState("messages", (prev) =>
        prev.map((msg) =>
          msg.id === payload.messageId
            ? { ...msg, content: payload.content, editedAt: payload.editedAt }
            : msg,
        ),
      );
      break;
    }

    case "message:deleted": {
      const payload = event.payload as {
        conversationId: string;
        messageId: string;
        senderId: string;
      };

      if (payload.conversationId !== getState("conversationId")) break;

      setState("messages", (prev) =>
        prev.map((msg) =>
          msg.id === payload.messageId
            ? { ...msg, isDeleted: true, content: "" }
            : msg,
        ),
      );
      break;
    }

    case "messages:sync": {
      const payload = event.payload as {
        conversationId: string;
        messages: Array<{
          id: string;
          content: string;
          senderId: string;
          senderRole: "visitor" | "operator" | "admin";
          createdAt: string;
          editedAt?: string | null;
        }>;
      };

      if (payload.conversationId !== getState("conversationId")) break;

      const syncedMessages: ChatMessage[] = payload.messages.map((m) => ({
        id: m.id,
        content: m.content,
        type: ((m as { type?: string }).type === "system" ? "system" : "text") as ChatMessage["type"],
        senderRole: m.senderRole,
        senderId: m.senderId,
        status: "sent" as const,
        createdAt: m.createdAt,
        editedAt: m.editedAt ?? null,
      }));

      setState("messages", (prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const newMessages = syncedMessages.filter((m) => !existingIds.has(m.id));
        return newMessages.length > 0 ? [...prev, ...newMessages] : prev;
      });
      break;
    }

    case "pong":
      break;

    case "conversation:accepted": {
      const payload = event.payload as { conversationId: string };
      if (payload.conversationId === getState("conversationId")) {
        setState("conversationStatus", "active");
      }
      break;
    }

    case "conversation:resolved": {
      const payload = event.payload as { conversationId: string };
      if (payload.conversationId === getState("conversationId")) {
        setState("conversationStatus", "closed");
      }
      break;
    }

    case "conversation:released": {
      const payload = event.payload as { conversationId: string };
      if (payload.conversationId === getState("conversationId")) {
        setState("conversationStatus", "pending");
      }
      break;
    }

    case "error": {
      const payload = event.payload as { code: string; message: string; retryAfter?: number };

      lastServerErrorCode = payload.code;

      if (payload.code === "RATE_LIMITED") {
        const retryAfter = payload.retryAfter ?? 5;
        setState("rateLimited", true);
        setState("rateLimitRetryAfter", retryAfter);

        const rateLimitError = new Error(`[DeliveryChat] Rate limited: ${payload.message}`);
        setState("messages", (prev) =>
          prev.map((msg) => {
            if (msg.status === "pending") {
              rejectPendingMessage(msg.id, rateLimitError);
              return { ...msg, status: "failed" as const };
            }
            return msg;
          }),
        );

        if (rateLimitTimer) clearTimeout(rateLimitTimer);
        rateLimitTimer = setTimeout(() => {
          rateLimitTimer = null;
          setState("rateLimited", false);
          setState("rateLimitRetryAfter", null);
        }, retryAfter * 1_000);
        break;
      }

      if (
        payload.code === "CONVERSATION_NOT_ACTIVE" ||
        payload.code === "CONVERSATION_NOT_FOUND"
      ) {
        clearStaleConversationPersistence();
        const convError = new Error(`[DeliveryChat] ${payload.code}: ${payload.message}`);
        setState("messages", (prev) =>
          prev.map((msg) => {
            if (msg.status === "pending") {
              rejectPendingMessage(msg.id, convError);
              return { ...msg, status: "failed" as const };
            }
            return msg;
          }),
        );
      }
      console.error(`[DeliveryChat WS] Error: ${payload.code} — ${payload.message}`);
      break;
    }
  }
}

function startPing(): void {
  stopPing();
  pingTimer = setInterval(() => {
    sendWSMessage({ type: "ping" });
  }, PING_INTERVAL);
}

function stopPing(): void {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function scheduleReconnect(): void {
  if (intentionalClose) return;

  setState("connectionStatus", "connecting");
  const delay = Math.min(
    RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts),
    RECONNECT_MAX_DELAY,
  );

  reconnectTimer = setTimeout(createConnection, delay);
}

function cleanup(): void {
  stopPing();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (rateLimitTimer) {
    clearTimeout(rateLimitTimer);
    rateLimitTimer = null;
  }
  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
    ws = null;
  }
  config = null;
}
