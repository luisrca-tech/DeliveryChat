import { setState, getState } from "./state.js";
import type { ChatMessage } from "./types.js";

type WSConfig = {
  apiBaseUrl: string;
  apiKey: string;
  appId: string;
  visitorId: string;
};

const PING_INTERVAL = 25_000;
const RECONNECT_BASE_DELAY = 1_000;
const RECONNECT_MAX_DELAY = 30_000;

let ws: WebSocket | null = null;
let config: WSConfig | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let intentionalClose = false;

export function connectWS(cfg: WSConfig): void {
  config = cfg;
  intentionalClose = false;
  reconnectAttempts = 0;
  setState("connectionStatus", "connecting");
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

function buildWsUrl(cfg: WSConfig): string {
  const protocol = cfg.apiBaseUrl.startsWith("https") ? "wss" : "ws";
  const host = cfg.apiBaseUrl.replace(/^https?:\/\//, "");
  return `${protocol}://${host}/v1/ws?token=${encodeURIComponent(cfg.apiKey)}&appId=${encodeURIComponent(cfg.appId)}&visitorId=${encodeURIComponent(cfg.visitorId)}`;
}

function createConnection(): void {
  if (!config) return;

  try {
    ws = new WebSocket(buildWsUrl(config));

    ws.onopen = () => {
      reconnectAttempts = 0;
      setState("connectionStatus", "connected");
      startPing();

      // Join conversation room if we have one
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

    ws.onclose = () => {
      setState("connectionStatus", "disconnected");
      stopPing();
      if (!intentionalClose) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      // onclose fires after onerror
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
        senderId: string;
        senderRole: "visitor" | "operator" | "admin";
        content: string;
        createdAt: string;
      };

      const newMsg: ChatMessage = {
        id: payload.id,
        content: payload.content,
        senderRole: payload.senderRole,
        senderId: payload.senderId,
        status: "sent",
        createdAt: payload.createdAt,
      };

      setState("messages", (prev) => [...prev, newMsg]);
      break;
    }

    case "message:ack": {
      const payload = event.payload as {
        clientMessageId: string;
        serverMessageId: string;
        createdAt: string;
      };

      setState("messages", (prev) =>
        prev.map((msg) =>
          msg.id === payload.clientMessageId
            ? {
                ...msg,
                id: payload.serverMessageId,
                status: "sent" as const,
                createdAt: payload.createdAt,
              }
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
        }>;
      };

      const syncedMessages: ChatMessage[] = payload.messages.map((m) => ({
        id: m.id,
        content: m.content,
        senderRole: m.senderRole,
        senderId: m.senderId,
        status: "sent" as const,
        createdAt: m.createdAt,
      }));

      setState("messages", (prev) => [...prev, ...syncedMessages]);
      break;
    }

    case "pong":
      // Heartbeat response — no action needed
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
      const payload = event.payload as { code: string; message: string };
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
  reconnectAttempts++;

  reconnectTimer = setTimeout(createConnection, delay);
}

function cleanup(): void {
  stopPing();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
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
}
