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

  constructor(config: WSClientConfig) {
    this.config = config;
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
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as WSServerEvent;
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
