import type { WidgetSettings } from "../types/index.js";

// ── Widget default settings ──

export const defaultSettings: WidgetSettings = {
  colors: {
    primary: "#0ea5e9",
    background: "#ffffff",
    text: "#0f172a",
    textSecondary: "#64748b",
    userBubble: "#0ea5e9",
    visitorBubble: "#f1f5f9",
  },
  font: {
    family: "system-ui, -apple-system, sans-serif",
    size: "14px",
  },
  position: {
    corner: "bottom-right",
    offset: "6px",
  },
  appearance: {
    borderRadius: "12px",
    shadow:
      "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
    width: "380px",
    height: "500px",
  },
  header: {
    title: "Chat with us",
    subtitle: "We typically reply within minutes",
    showLogo: true,
  },
  launcher: {
    icon: "chat",
    label: "Open chat",
  },
  behavior: {
    autoOpen: false,
    autoOpenDelay: 5000,
  },
};

// ── WebSocket ──

export const PING_INTERVAL = 25_000;
export const RECONNECT_BASE_DELAY = 1_000;
export const RECONNECT_MAX_DELAY = 30_000;
export const WS_TYPING_TIMEOUT_MS = 3_000;
export const RECONNECT_WARN_THRESHOLD = 5;
export const PERMANENT_ERROR_CODES = new Set(["UNAUTHORIZED"]);
export const PERMANENT_CLOSE_CODES = new Set([
  1008,
]);

export const CONV_STORAGE_PREFIX = "dc_conv_";
export const LAST_MSG_STORAGE_PREFIX = "dc_lastmsg_";


export const TYPING_THROTTLE_MS = 2_000;
export const LONG_PRESS_MS = 500;
export const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const DELETE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
export const HOST_ID = "delivery-chat-root";
export const MAX_MESSAGES = 100;

export * from "./icons.js";
