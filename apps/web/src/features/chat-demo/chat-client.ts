const VISITOR_ID_KEY = "dc_visitor_id";

export function resolveVisitorId(): string {
  const stored = localStorage.getItem(VISITOR_ID_KEY);
  if (stored) return stored;
  const id = crypto.randomUUID();
  localStorage.setItem(VISITOR_ID_KEY, id);
  return id;
}

// --- Types ---

export type Participant = {
  userId: string;
  role: string;
  joinedAt: string;
};

export type Conversation = {
  id: string;
  status: string;
  subject: string | null;
  assignedTo: string | null;
  participants: Participant[];
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  editedAt: string | null;
  createdAt: string;
};

export type PaginationOptions = {
  limit?: number;
  offset?: number;
};

// --- Client factory ---

export type ChatClientOptions = {
  apiUrl: string;
  apiKey: string;
  appId: string;
};

function buildHeaders(apiKey: string, appId: string, visitorId: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "X-App-Id": appId,
    "X-Visitor-Id": visitorId,
    "Content-Type": "application/json",
    Origin: typeof window !== "undefined" ? window.location.origin : "",
  };
}

export function createChatClient({ apiUrl, apiKey, appId }: ChatClientOptions) {
  const base = `${apiUrl}/v1/api`;

  function headers(): HeadersInit {
    return buildHeaders(apiKey, appId, resolveVisitorId());
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers(), ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw Object.assign(new Error(body.message ?? res.statusText), { status: res.status, body });
    }
    return res.json() as Promise<T>;
  }

  return {
    getWsToken(): Promise<{ token: string }> {
      return request("/ws-token", { method: "POST" });
    },

    createConversation(subject?: string): Promise<{ conversation: Conversation }> {
      return request("/conversations", {
        method: "POST",
        body: JSON.stringify({ subject }),
      });
    },

    listConversations(
      opts?: PaginationOptions,
    ): Promise<{ conversations: Conversation[]; total: number; limit: number; offset: number }> {
      const params = new URLSearchParams();
      if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
      if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
      const qs = params.toString();
      return request(`/conversations${qs ? `?${qs}` : ""}`);
    },

    getConversation(id: string): Promise<{ conversation: Conversation }> {
      return request(`/conversations/${id}`);
    },

    getMessages(
      conversationId: string,
      opts?: PaginationOptions,
    ): Promise<{ messages: Message[]; limit: number; offset: number }> {
      const params = new URLSearchParams();
      if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
      if (opts?.offset !== undefined) params.set("offset", String(opts.offset));
      const qs = params.toString();
      return request(`/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`);
    },

    sendMessage(
      conversationId: string,
      content: string,
    ): Promise<{ message: Message }> {
      return request(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
    },

    editMessage(
      conversationId: string,
      messageId: string,
      content: string,
    ): Promise<{ message: Message }> {
      return request(`/conversations/${conversationId}/messages/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ content }),
      });
    },

    deleteMessage(
      conversationId: string,
      messageId: string,
    ): Promise<{ success: boolean }> {
      return request(`/conversations/${conversationId}/messages/${messageId}`, {
        method: "DELETE",
      });
    },

    markAsRead(
      conversationId: string,
      messageId: string,
    ): Promise<{ success: boolean }> {
      return request(`/conversations/${conversationId}/read`, {
        method: "POST",
        body: JSON.stringify({ messageId }),
      });
    },

    getUnreadCount(conversationId: string): Promise<{ unreadCount: number }> {
      return request(`/conversations/${conversationId}/unread`);
    },

    async connectWebSocket(token: string): Promise<WebSocket> {
      const wsBase = base.replace(/^http/, "ws");
      const ws = new WebSocket(`${wsBase.replace("/api", "")}/ws?token=${encodeURIComponent(token)}`);
      return new Promise((resolve, reject) => {
        ws.addEventListener("open", () => resolve(ws), { once: true });
        ws.addEventListener("error", reject, { once: true });
      });
    },
  };
}

export type ChatClient = ReturnType<typeof createChatClient>;
