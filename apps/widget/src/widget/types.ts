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
  };
  behavior: {
    autoOpen: boolean;
    autoOpenDelay: number;
  };
};

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
    offset: "16px",
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

export type InitOptions = {
  appId: string;
  apiBaseUrl?: string;
  position?: "bottom-left" | "bottom-right";
  autoOpen?: boolean;
  autoOpenDelay?: number;
  colors?: Partial<WidgetSettings["colors"]>;
};

export type ChatMessage = {
  id: string;
  content: string;
  senderRole: "visitor" | "operator" | "admin";
  senderId: string;
  status: "pending" | "sent" | "failed";
  createdAt: string;
};

export type ConversationStatus = "pending" | "active" | "closed";
