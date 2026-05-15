import type { MessageDeletedPayload, MessageEditedPayload } from "@repo/types";
import type { Conversation, Message } from "../chat-client";

export type OptimisticMessage = Message & {
  clientId?: string;
  pending?: boolean;
  sendError?: boolean;
};

export type WsReducerState = {
  messages: OptimisticMessage[];
  conversations: Conversation[];
  operatorTypingName: string | null;
};

export type WsReducerSideEffect =
  | { kind: "close-socket" }
  | { kind: "refresh-unread"; conversationId: string }
  | { kind: "persist-last-message"; conversationId: string; messageId: string }
  | { kind: "mark-as-read"; conversationId: string; messageId: string };

export type WsReducerResult = {
  state: WsReducerState;
  sideEffects: WsReducerSideEffect[];
};

export type WsEvent = {
  type: string;
  payload: Record<string, unknown>;
};

export function wsMessageReducer(
  state: WsReducerState,
  event: WsEvent,
  selectedConversationId: string | null,
): WsReducerResult {
  const none: WsReducerResult = { state, sideEffects: [] };

  switch (event.type) {
    case "message:ack": {
      const { clientMessageId, serverMessageId, createdAt } = event.payload as {
        clientMessageId: string;
        serverMessageId: string;
        createdAt: string;
      };
      const messages = state.messages.map((m) =>
        m.clientId === clientMessageId
          ? {
              ...m,
              id: serverMessageId,
              createdAt,
              pending: false,
              clientId: undefined,
            }
          : m,
      );
      const sideEffects: WsReducerSideEffect[] = selectedConversationId
        ? [
            {
              kind: "persist-last-message",
              conversationId: selectedConversationId,
              messageId: serverMessageId,
            },
          ]
        : [];
      return { state: { ...state, messages }, sideEffects };
    }

    case "message:new": {
      const {
        id,
        conversationId,
        senderId,
        content,
        createdAt,
        editedAt,
        type: msgType,
      } = event.payload as {
        id: string;
        conversationId: string;
        senderId: string;
        content: string;
        createdAt: string;
        editedAt?: string | null;
        type?: string;
      };

      if (conversationId === selectedConversationId) {
        const alreadyExists = state.messages.some((m) => m.id === id);
        if (alreadyExists) return none;
        return {
          state: {
            ...state,
            messages: [
              ...state.messages,
              {
                id,
                conversationId,
                senderId,
                content,
                createdAt,
                editedAt: editedAt ?? null,
                pending: false,
                type: msgType === "system" ? "system" : "text",
              },
            ],
            operatorTypingName: null,
          },
          sideEffects: [
            { kind: "persist-last-message", conversationId, messageId: id },
            { kind: "mark-as-read", conversationId, messageId: id },
          ],
        };
      }

      return {
        state,
        sideEffects: [{ kind: "refresh-unread", conversationId }],
      };
    }

    case "messages:sync": {
      const { conversationId, messages: synced } = event.payload as {
        conversationId: string;
        messages: Message[];
      };
      if (conversationId !== selectedConversationId || !synced.length)
        return none;

      const existingIds = new Set(state.messages.map((m) => m.id));
      const newMsgs = synced.filter((m) => !existingIds.has(m.id));
      if (!newMsgs.length) return none;

      const last = newMsgs[newMsgs.length - 1]!;
      return {
        state: { ...state, messages: [...state.messages, ...newMsgs] },
        sideEffects: [
          { kind: "persist-last-message", conversationId, messageId: last.id },
        ],
      };
    }

    case "message:edited": {
      const { messageId, conversationId, content, editedAt } =
        event.payload as unknown as MessageEditedPayload;
      if (conversationId !== selectedConversationId) return none;
      return {
        state: {
          ...state,
          messages: state.messages.map((m) =>
            m.id === messageId ? { ...m, content, editedAt } : m,
          ),
        },
        sideEffects: [],
      };
    }

    case "message:deleted": {
      const { messageId, conversationId } =
        event.payload as unknown as MessageDeletedPayload;
      if (conversationId !== selectedConversationId) return none;
      return {
        state: {
          ...state,
          messages: state.messages.filter((m) => m.id !== messageId),
        },
        sideEffects: [],
      };
    }

    case "typing:start": {
      const { conversationId, userName } = event.payload as {
        conversationId: string;
        userName: string | null;
      };
      if (conversationId !== selectedConversationId) return none;
      return {
        state: { ...state, operatorTypingName: userName ?? "Operator" },
        sideEffects: [],
      };
    }

    case "typing:stop": {
      const { conversationId } = event.payload as { conversationId: string };
      if (conversationId !== selectedConversationId) return none;
      return { state: { ...state, operatorTypingName: null }, sideEffects: [] };
    }

    case "conversation:accepted": {
      const { conversationId, assignedTo } = event.payload as {
        conversationId: string;
        assignedTo: string;
      };
      return {
        state: {
          ...state,
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, status: "active", assignedTo }
              : c,
          ),
        },
        sideEffects: [],
      };
    }

    case "conversation:released": {
      const { conversationId } = event.payload as { conversationId: string };
      return {
        state: {
          ...state,
          conversations: state.conversations.map((c) =>
            c.id === conversationId
              ? { ...c, status: "pending", assignedTo: null }
              : c,
          ),
        },
        sideEffects: [],
      };
    }

    case "conversation:resolved": {
      const { conversationId } = event.payload as { conversationId: string };
      const sideEffects: WsReducerSideEffect[] =
        conversationId === selectedConversationId
          ? [{ kind: "close-socket" }]
          : [];
      return {
        state: {
          ...state,
          conversations: state.conversations.map((c) =>
            c.id === conversationId ? { ...c, status: "closed" } : c,
          ),
        },
        sideEffects,
      };
    }

    default:
      return none;
  }
}
