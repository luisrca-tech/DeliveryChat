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
};

export type ChatMessage = {
  id: string;
  content: string;
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

export type DeliveryChatAPI = {
  init: (opts: InitOptions) => void;
  destroy: () => void;
  queue: unknown[];
};
