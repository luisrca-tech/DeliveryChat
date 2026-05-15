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

export type ChatMessage = {
  id: string;
  content: string;
  type: "text" | "system";
  senderRole: "visitor" | "operator" | "admin";
  senderId: string;
  status: "pending" | "sent" | "failed";
  createdAt: string;
  editedAt?: string | null;
  isDeleted?: boolean;
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
  queue: unknown[];
};
