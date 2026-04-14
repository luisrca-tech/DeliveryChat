type ConversationResponse = {
  conversation: {
    id: string;
    organizationId: string;
    applicationId: string;
    type: string;
    status: string;
    subject: string | null;
    createdAt: string;
  };
};

type MessagesResponse = {
  messages: Array<{
    id: string;
    conversationId: string;
    senderId: string;
    senderName: string | null;
    type: string;
    content: string;
    createdAt: string;
  }>;
  limit: number;
  offset: number;
};

function buildHeaders(appId: string, visitorId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "X-App-Id": appId,
    "Content-Type": "application/json",
  };
  if (visitorId) {
    headers["X-Visitor-Id"] = visitorId;
  }
  return headers;
}

export async function createConversation(
  apiBaseUrl: string,
  appId: string,
  visitorId: string,
  subject?: string,
): Promise<ConversationResponse> {
  const url = `${apiBaseUrl}/v1/widget/conversations`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(appId, visitorId),
    body: JSON.stringify({ subject }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(
      (err as { message?: string })?.message ?? `Failed to create conversation (${res.status})`,
    );
  }

  return res.json() as Promise<ConversationResponse>;
}

export async function getConversationMessages(
  apiBaseUrl: string,
  appId: string,
  conversationId: string,
  limit = 50,
  offset = 0,
): Promise<MessagesResponse> {
  const url = `${apiBaseUrl}/v1/widget/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`;
  const res = await fetch(url, {
    headers: buildHeaders(appId),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch messages (${res.status})`);
  }

  return res.json() as Promise<MessagesResponse>;
}

export async function getUnreadCount(
  apiBaseUrl: string,
  appId: string,
  conversationId: string,
  visitorId: string,
): Promise<number> {
  const url = `${apiBaseUrl}/v1/widget/conversations/${conversationId}/unread`;
  const res = await fetch(url, {
    headers: buildHeaders(appId, visitorId),
  });

  if (!res.ok) return 0;

  const data = (await res.json()) as { unreadCount: number };
  return data.unreadCount;
}

export async function markConversationAsRead(
  apiBaseUrl: string,
  appId: string,
  conversationId: string,
  visitorId: string,
): Promise<void> {
  const url = `${apiBaseUrl}/v1/widget/conversations/${conversationId}/read`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(appId, visitorId),
  });

  if (!res.ok) {
    throw new Error(`Failed to mark conversation as read (${res.status})`);
  }
}
