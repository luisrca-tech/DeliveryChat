export type WidgetSettings = {
  colors: {
    primary: string;
    background: string;
    text: string;
    textSecondary: string;
    userBubble: string;
    visitorBubble: string;
  };
  font: {
    family: string;
    size: string;
  };
  position: {
    corner: "bottom-left" | "bottom-right";
    offset: string;
  };
  appearance: {
    borderRadius: string;
    shadow: string;
    width: string;
    height: string;
  };
  header: {
    title: string;
    subtitle: string;
    showLogo: boolean;
    logoUrl?: string;
  };
  launcher: {
    icon: "chat" | "question" | "message";
    label: string;
    logoUrl?: string;
  };
  behavior: {
    autoOpen: boolean;
    autoOpenDelay: number;
  };
  /**
   * AI assistant disclosure (California B.O.T. Act / EU AI Act transparency —
   * see plans/ai-database-connection-feature.md §8). `enabled` is server-derived
   * from the application's entitlement; `assistantLabel` overrides the display
   * name used in the AI bubble label and the opening disclosure line.
   */
  ai: {
    enabled: boolean;
    assistantLabel?: string;
  };
};

export type InitOptions = {
  appId: string;
  apiBaseUrl?: string;
  position?: "bottom-left" | "bottom-right";
  autoOpen?: boolean;
  autoOpenDelay?: number;
  colors?: Partial<WidgetSettings["colors"]>;
  launcherLogoUrl?: string | null;
  headless?: boolean;
};

/**
 * Discriminates who authored a message (mirrors the backend `message_author_type`
 * enum). Optional for backward compatibility with payloads emitted before AI
 * turns existed.
 */
export type MessageAuthorType = "visitor" | "operator" | "ai" | "system";

export type ChatMessage = {
  id: string;
  content: string;
  contentFormat?: "plain" | "lexical";
  contentHtml?: string | null;
  type: "text" | "system";
  senderRole: "visitor" | "operator" | "admin";
  senderId: string;
  status: "pending" | "sent" | "failed";
  createdAt: string;
  editedAt?: string | null;
  isDeleted?: boolean;
  authorType?: MessageAuthorType;
};

export type ConversationStatus = "pending" | "active" | "closed";

export type TypingUser = {
  userId: string;
  userName: string | null;
  senderRole: string;
} | null;

export type ConnectionError = {
  type: "permanent" | "temporary";
  userMessage: string;
  devMessage: string;
} | null;

export type BubbleContext = {
  visitorId: string | null;
  onEdit: (messageId: string, content: string) => void;
  onDelete: (messageId: string) => void;
  /** Display label for authorType: 'ai' bubbles. Defaults to "AI Assistant". */
  aiAssistantLabel?: string;
};

export type IdentifyParams = {
  name?: string;
  email?: string;
  externalId?: string;
  metadata?: Record<string, unknown>;
  hmac?: string;
};

export type IdentityResult = {
  id: string;
  anonymousUserId: string;
  organizationId: string;
  externalId?: string | null;
  email?: string | null;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
  hmacVerified: boolean;
};

import type { SdkEventMap } from "../SdkEventMap.js";

type Listener<T> = (payload: T) => void;

export type ConversationSnapshot = {
  id: string;
  status: string;
  messages: ChatMessage[];
};

export type DeliveryChatAPI = {
  init: (opts: InitOptions) => void;
  destroy: () => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  hideWidget: () => void;
  showWidget: () => void;
  on: <K extends keyof SdkEventMap>(
    event: K,
    callback: Listener<SdkEventMap[K]>,
  ) => void;
  off: <K extends keyof SdkEventMap>(
    event: K,
    callback: Listener<SdkEventMap[K]>,
  ) => void;
  sendMessage: (text: string) => Promise<ChatMessage>;
  identify: (params: IdentifyParams) => Promise<IdentityResult>;
  getConversation: () => ConversationSnapshot | null;
  /**
   * Deterministic "Talk to a human" escalation trigger (AC #4). Resolves once
   * the escalation is accepted by the server; idempotent when already
   * human-handled.
   */
  requestHuman: () => Promise<void>;
  queue: unknown[];
};
