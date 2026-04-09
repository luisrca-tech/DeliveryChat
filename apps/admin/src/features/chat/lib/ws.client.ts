import type { WSServerEvent, WSClientEvent } from "@repo/types";

export type WSEventHandler = (event: WSServerEvent) => void;

export type WSClientConfig = {
  url: string;
  onEvent: WSEventHandler;
  onConnectionChange: (connected: boolean) => void;
};

const PING_INTERVAL = 30_000;
const RECONNECT_BASE_DELAY = 1_000;
const RECONNECT_MAX_DELAY = 30_000;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: WSClientConfig;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private activeRoom: { conversationId: string; lastMessageId?: string } | null = null;

  constructor(config: WSClientConfig) {
    this.config = config;
  }

  setActiveRoom(
    conversationId: string | null,
    lastMessageId?: string,
    force = false,
  ): void {
    console.log(`[WS:Client] setActiveRoom convId=${conversationId} prev=${this.activeRoom?.conversationId ?? "none"} connected=${this.isConnected}`);

    if (this.activeRoom && this.activeRoom.conversationId !== conversationId) {
      this.send({ type: "room:leave", payload: { conversationId: this.activeRoom.conversationId } });
    }

    if (!conversationId) {
      this.activeRoom = null;
      return;
    }

    const sameRoom =
      this.activeRoom?.conversationId === conversationId &&
      (this.activeRoom.lastMessageId ?? undefined) === (lastMessageId ?? undefined);
    if (sameRoom && !force) {
      return;
    }

    this.activeRoom = { conversationId, lastMessageId };

    if (this.isConnected) {
      console.log(`[WS:Client] sending room:join for ${conversationId}`);
      this.send({
        type: "room:join",
        payload: { conversationId, ...(lastMessageId ? { lastMessageId } : {}) },
      });
    } else {
      console.log(`[WS:Client] WS not connected — room:join buffered for ${conversationId}`);
    }
  }

  connect(): void {
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this.createConnection();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
  }

  send(event: WSClientEvent): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(event));
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private createConnection(): void {
    try {
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.config.onConnectionChange(true);
        this.startPing();
        console.log(`[WS:Client] connected — activeRoom=${this.activeRoom?.conversationId ?? "none"}`);

        if (this.activeRoom) {
          console.log(`[WS:Client] auto-joining room ${this.activeRoom.conversationId} on connect`);
          this.send({
            type: "room:join",
            payload: {
              conversationId: this.activeRoom.conversationId,
              ...(this.activeRoom.lastMessageId ? { lastMessageId: this.activeRoom.lastMessageId } : {}),
            },
          });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as WSServerEvent;
          console.log(`[WS:Client] received event=${parsed.type}`, parsed.type === "message:new" ? `from=${(parsed.payload as { senderId: string }).senderId}` : "");
          this.config.onEvent(parsed);
        } catch {
          // Ignore non-JSON messages
        }
      };

      this.ws.onclose = () => {
        this.config.onConnectionChange(false);
        this.stopPing();
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        // onclose will fire after onerror
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping" });
    }, PING_INTERVAL);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;

    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_DELAY,
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.createConnection();
    }, delay);
  }

  private cleanup(): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.config.onConnectionChange(false);
  }
}
