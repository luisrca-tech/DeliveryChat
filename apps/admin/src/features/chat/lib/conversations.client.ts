import { HTTP_STATUS } from "@repo/types";
import { getApiBaseUrl } from "@/lib/urls";
import { getTenantHeaders } from "@/lib/tenantHeaders";
import type {
  ConversationsListResponse,
  ConversationDetailResponse,
  MessagesListResponse,
  ConversationFilters,
} from "../types/chat.types";

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export class ConversationNotFoundError extends Error {
  constructor(message = "Conversation not found") {
    super(message);
    this.name = "ConversationNotFoundError";
  }
}

export class ConversationConflictError extends Error {
  constructor(message = "Conversation is no longer available") {
    super(message);
    this.name = "ConversationConflictError";
  }
}

async function handleError(res: Response): Promise<never> {
  const err = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  const message =
    err?.message ?? err?.error ?? `Request failed (${res.status})`;

  if (res.status === HTTP_STATUS.NOT_FOUND) {
    throw new ConversationNotFoundError(message);
  }

  if (res.status === HTTP_STATUS.CONFLICT) {
    throw new ConversationConflictError(message);
  }

  throw new Error(message);
}

const base = () => getApiBaseUrl();

export async function listConversations(
  filters: ConversationFilters,
): Promise<ConversationsListResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(filters.limit));
  params.set("offset", String(filters.offset));
  if (filters.status) params.set("status", filters.status);
  if (filters.type) params.set("type", filters.type);
  if (filters.applicationId) params.set("applicationId", filters.applicationId);
  if (filters.assignedTo) params.set("assignedTo", filters.assignedTo);

  const res = await fetch(`${base()}/conversations?${params}`, {
    headers: getTenantHeaders(),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<ConversationsListResponse>(res);
}

export async function getConversation(
  id: string,
): Promise<ConversationDetailResponse> {
  const res = await fetch(`${base()}/conversations/${id}`, {
    headers: getTenantHeaders(),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson<ConversationDetailResponse>(res);
}

export async function getMessages(
  conversationId: string,
  limit = 50,
  offset = 0,
): Promise<MessagesListResponse> {
  const res = await fetch(
    `${base()}/conversations/${conversationId}/messages?limit=${limit}&offset=${offset}`,
    { headers: getTenantHeaders() },
  );
  if (!res.ok) throw await handleError(res);
  return parseJson<MessagesListResponse>(res);
}

export async function acceptConversation(
  id: string,
): Promise<{ conversation: { id: string; status: string; assignedTo: string } }> {
  const res = await fetch(`${base()}/conversations/${id}/accept`, {
    method: "POST",
    headers: getTenantHeaders(),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson(res);
}

export async function leaveConversation(
  id: string,
): Promise<{ conversation: { id: string; status: string } }> {
  const res = await fetch(`${base()}/conversations/${id}/leave`, {
    method: "POST",
    headers: getTenantHeaders(),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson(res);
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${base()}/conversations/${id}`, {
    method: "DELETE",
    headers: getTenantHeaders(),
  });
  if (!res.ok) throw await handleError(res);
}

export async function resolveConversation(
  id: string,
): Promise<{ conversation: { id: string; status: string } }> {
  const res = await fetch(`${base()}/conversations/${id}/resolve`, {
    method: "POST",
    headers: getTenantHeaders(),
  });
  if (!res.ok) throw await handleError(res);
  return parseJson(res);
}
