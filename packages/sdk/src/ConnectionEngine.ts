import { fetchWsToken } from "./api.js";
import {
  PING_INTERVAL,
  RECONNECT_BASE_DELAY,
  RECONNECT_MAX_DELAY,
  RECONNECT_WARN_THRESHOLD,
  PERMANENT_ERROR_CODES,
  PERMANENT_CLOSE_CODES,
} from "./constants/index.js";
import type { ConnectionError } from "./types/index.js";

export type ConnectionState = "disconnected" | "connecting" | "connected";

type WSConfig = {
  apiBaseUrl: string;
  appId: string;
  visitorId: string;
};

type ConnectionEngineOptions = {
  onStateChange: (state: ConnectionState, error?: ConnectionError) => void;
  onMessage: (event: { type: string; payload?: unknown }) => void;
};

export class ConnectionEngine {
  private ws: WebSocket | null = null;
  private config: WSConfig | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private intentionalClose = false;
  private lastServerErrorCode: string | null = null;

  private readonly onStateChange: ConnectionEngineOptions["onStateChange"];
  private readonly onMessage: ConnectionEngineOptions["onMessage"];

  constructor(options: ConnectionEngineOptions) {
    this.onStateChange = options.onStateChange;
    this.onMessage = options.onMessage;
  }

  connect(cfg: WSConfig): void {
    if (this.ws || this.reconnectTimer) {
      this.intentionalClose = true;
      this.cleanup();
    }
    this.intentionalClose = false;
    this.reconnectAttempts = 0;
    this.lastServerErrorCode = null;
    this.config = cfg;
    this.onStateChange("connecting");
    this.createConnection();
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();
    this.onStateChange("disconnected");
  }

  send(message: object): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  markServerError(code: string): void {
    this.lastServerErrorCode = code;
  }

  private async createConnection(): Promise<void> {
    if (!this.config) return;

    try {
      const token = await fetchWsToken(
        this.config.apiBaseUrl,
        this.config.appId,
        this.config.visitorId,
      );
      if (this.intentionalClose || !this.config) return;

      const url = this.buildWsUrl(this.config.apiBaseUrl, token);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.lastServerErrorCode = null;
        this.onStateChange("connected");
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          this.onMessage(parsed);
        } catch {
          // Ignore non-JSON
        }
      };

      this.ws.onclose = (event) => {
        this.onStateChange("disconnected");
        this.stopPing();

        if (this.intentionalClose) return;

        const closeCode = (event as CloseEvent)?.code;
        const isPermanent =
          (this.lastServerErrorCode && PERMANENT_ERROR_CODES.has(this.lastServerErrorCode)) ||
          (closeCode !== undefined && PERMANENT_CLOSE_CODES.has(closeCode));

        if (isPermanent) {
          const errorCode = this.lastServerErrorCode ?? `close_${closeCode}`;
          const error: ConnectionError = {
            type: "permanent",
            userMessage: "Chat is temporarily unavailable",
            devMessage: `[DeliveryChat] Connection failed: ${errorCode}. Check that your appId is valid and the application exists.`,
          };
          this.onStateChange("disconnected", error);
          return;
        }

        this.reconnectAttempts++;
        if (this.reconnectAttempts >= RECONNECT_WARN_THRESHOLD) {
          const error: ConnectionError = {
            type: "temporary",
            userMessage: "Connection lost. Retrying...",
            devMessage: `[DeliveryChat] Connection lost after ${this.reconnectAttempts} attempts. Still retrying...`,
          };
          this.onStateChange("connecting", error);
        } else {
          this.onStateChange("connecting");
        }

        this.scheduleReconnect();
      };

      this.ws.onerror = () => {};
    } catch {
      this.scheduleReconnect();
    }
  }

  private buildWsUrl(baseUrl: string, token: string): string {
    const protocol = baseUrl.startsWith("https") ? "wss" : "ws";
    const host = baseUrl.replace(/^https?:\/\//, "");
    return `${protocol}://${host}/api/v1/ws?token=${encodeURIComponent(token)}`;
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

    this.reconnectTimer = setTimeout(() => this.createConnection(), delay);
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
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.config = null;
  }
}
