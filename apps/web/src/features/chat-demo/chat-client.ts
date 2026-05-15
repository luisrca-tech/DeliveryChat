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
  participants?: Participant[];
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
  type: "text" | "system";
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
  visitorId: string;
};

function buildHeaders(
  apiKey: string,
  appId: string,
  visitorId: string,
): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    "X-App-Id": appId,
    "X-Visitor-Id": visitorId,
    "Content-Type": "application/json",
    Origin: typeof window !== "undefined" ? window.location.origin : "",
  };
}

export function createChatClient({
  apiUrl,
  apiKey,
  appId,
  visitorId,
}: ChatClientOptions) {
  const base = `${apiUrl}/api/v1/widget`;

  function headers(): HeadersInit {
    return buildHeaders(apiKey, appId, visitorId);
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers(), ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw Object.assign(new Error(body.message ?? res.statusText), {
        status: res.status,
        body,
      });
    }
    return res.json() as Promise<T>;
  }

  return {
    getWsToken(): Promise<{ token: string }> {
      return request("/ws-token", { method: "POST" });
    },

    createConversation(
      subject?: string,
    ): Promise<{ conversation: Conversation }> {
      return request("/conversations", {
        method: "POST",
        body: JSON.stringify({ subject }),
      });
    },

    listConversations(
      opts?: PaginationOptions,
    ): Promise<{
      conversations: Conversation[];
      visitorUserId: string;
      total: number;
      limit: number;
      offset: number;
    }> {
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
      return request(
        `/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`,
      );
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
      const wsBase = apiUrl.replace(/^http/, "ws");
      const ws = new WebSocket(
        `${wsBase}/api/v1/ws?token=${encodeURIComponent(token)}`,
      );
      return new Promise((resolve, reject) => {
        ws.addEventListener("open", () => resolve(ws), { once: true });
        ws.addEventListener("error", reject, { once: true });
      });
    },
  };
}

export type ChatClient = ReturnType<typeof createChatClient>;
