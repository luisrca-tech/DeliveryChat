import { setState, getState } from "./state.js";
import type { ChatMessage } from "./types/index.js";
import { clearStaleConversationPersistence } from "./conversation-persistence.js";
import { WS_TYPING_TIMEOUT_MS } from "./constants/index.js";
import type { MessagePipeline } from "./MessagePipeline.js";

type MessageRouterOptions = {
  markServerError: (code: string) => void;
  pipeline: MessagePipeline;
};

export class MessageRouter {
  private typingTimer: ReturnType<typeof setTimeout> | null = null;
  private rateLimitTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly markServerError: MessageRouterOptions["markServerError"];
  private readonly pipeline: MessagePipeline;

  constructor(options: MessageRouterOptions) {
    this.markServerError = options.markServerError;
    this.pipeline = options.pipeline;
  }

  handle(event: { type: string; payload?: unknown }): void {
    switch (event.type) {
      case "message:new":
        this.handleMessageNew(event.payload);
        break;
      case "message:ack":
        this.handleMessageAck(event.payload);
        break;
      case "message:edited":
        this.handleMessageEdited(event.payload);
        break;
      case "message:deleted":
        this.handleMessageDeleted(event.payload);
        break;
      case "messages:sync":
        this.handleMessagesSync(event.payload);
        break;
      case "typing:start":
        this.handleTypingStart(event.payload);
        break;
      case "typing:stop":
        this.handleTypingStop(event.payload);
        break;
      case "conversation:accepted":
        this.handleConversationStatus(event.payload, "active");
        break;
      case "conversation:resolved":
        this.handleConversationStatus(event.payload, "closed");
        break;
      case "conversation:released":
        this.handleConversationStatus(event.payload, "pending");
        break;
      case "error":
        this.handleError(event.payload);
        break;
      case "pong":
        break;
    }
  }

  cleanup(): void {
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
    if (this.rateLimitTimer) {
      clearTimeout(this.rateLimitTimer);
      this.rateLimitTimer = null;
    }
  }

  private handleMessageNew(payload: unknown): void {
    const p = payload as {
      id: string;
      conversationId: string;
      senderId: string | null;
      senderRole: "visitor" | "operator" | "admin";
      content: string;
      type?: string;
      createdAt: string;
      editedAt?: string | null;
    };

    if (p.conversationId !== getState("conversationId")) return;

    const msgType = p.type === "system" ? "system" : "text";
    const newMsg: ChatMessage = {
      id: p.id,
      content: p.content,
      type: msgType,
      senderRole: p.senderRole,
      senderId: p.senderId ?? "",
      status: "sent",
      createdAt: p.createdAt,
      editedAt: p.editedAt ?? null,
    };

    let wasDuplicate = false;
    setState("messages", (prev) => {
      if (prev.some((m) => m.id === newMsg.id)) {
        wasDuplicate = true;
        return prev;
      }
      return [...prev, newMsg];
    });

    if (!wasDuplicate) {
      this.pipeline.processIncoming(newMsg);

      if (p.senderRole !== "visitor" && !getState("isOpen")) {
        setState("unreadCount", (prev) => prev + 1);
      }
    }

    if (p.senderId === getState("typingUser")?.userId) {
      this.clearTypingState();
    }
  }

  private handleMessageAck(payload: unknown): void {
    const p = payload as {
      clientMessageId: string;
      serverMessageId: string;
      createdAt: string;
    };

    this.pipeline.processAck(p);
  }

  private handleMessageEdited(payload: unknown): void {
    const p = payload as {
      conversationId: string;
      messageId: string;
      content: string;
      editedAt: string;
      senderId: string;
    };

    if (p.conversationId !== getState("conversationId")) return;

    setState("messages", (prev) =>
      prev.map((msg) =>
        msg.id === p.messageId
          ? { ...msg, content: p.content, editedAt: p.editedAt }
          : msg,
      ),
    );
  }

  private handleMessageDeleted(payload: unknown): void {
    const p = payload as {
      conversationId: string;
      messageId: string;
      senderId: string;
    };

    if (p.conversationId !== getState("conversationId")) return;

    setState("messages", (prev) =>
      prev.map((msg) =>
        msg.id === p.messageId
          ? { ...msg, isDeleted: true, content: "" }
          : msg,
      ),
    );
  }

  private handleMessagesSync(payload: unknown): void {
    const p = payload as {
      conversationId: string;
      messages: Array<{
        id: string;
        content: string;
        senderId: string;
        senderRole: "visitor" | "operator" | "admin";
        createdAt: string;
        editedAt?: string | null;
      }>;
    };

    if (p.conversationId !== getState("conversationId")) return;

    const syncedMessages: ChatMessage[] = p.messages.map((m) => ({
      id: m.id,
      content: m.content,
      type: ((m as { type?: string }).type === "system" ? "system" : "text") as ChatMessage["type"],
      senderRole: m.senderRole,
      senderId: m.senderId,
      status: "sent" as const,
      createdAt: m.createdAt,
      editedAt: m.editedAt ?? null,
    }));

    setState("messages", (prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const newMessages = syncedMessages.filter((m) => !existingIds.has(m.id));
      return newMessages.length > 0 ? [...prev, ...newMessages] : prev;
    });
  }

  private handleTypingStart(payload: unknown): void {
    const p = payload as {
      conversationId: string;
      userId: string;
      userName: string | null;
      senderRole: string;
    };
    setState("typingUser", {
      userId: p.userId,
      userName: p.userName,
      senderRole: p.senderRole,
    });
    if (this.typingTimer) clearTimeout(this.typingTimer);
    this.typingTimer = setTimeout(() => setState("typingUser", null), WS_TYPING_TIMEOUT_MS);
  }

  private handleTypingStop(payload: unknown): void {
    const p = payload as { conversationId: string; userId: string };
    const current = getState("typingUser");
    if (current?.userId === p.userId) {
      this.clearTypingState();
    }
  }

  private handleConversationStatus(payload: unknown, status: string): void {
    const p = payload as { conversationId: string };
    if (p.conversationId === getState("conversationId")) {
      setState("conversationStatus", status as "pending" | "active" | "closed");
    }
  }

  private handleError(payload: unknown): void {
    const p = payload as { code: string; message: string; retryAfter?: number };

    this.markServerError(p.code);

    if (p.code === "RATE_LIMITED") {
      const retryAfter = p.retryAfter ?? 5;
      setState("rateLimited", true);
      setState("rateLimitRetryAfter", retryAfter);

      const rateLimitError = new Error(`[DeliveryChat] Rate limited: ${p.message}`);
      setState("messages", (prev) =>
        prev.map((msg) => {
          if (msg.status === "pending") {
            this.pipeline.rejectPending(msg.id, rateLimitError);
            return { ...msg, status: "failed" as const };
          }
          return msg;
        }),
      );

      if (this.rateLimitTimer) clearTimeout(this.rateLimitTimer);
      this.rateLimitTimer = setTimeout(() => {
        this.rateLimitTimer = null;
        setState("rateLimited", false);
        setState("rateLimitRetryAfter", null);
      }, retryAfter * 1_000);
      return;
    }

    if (p.code === "CONVERSATION_NOT_ACTIVE" || p.code === "CONVERSATION_NOT_FOUND") {
      clearStaleConversationPersistence();
      const convError = new Error(`[DeliveryChat] ${p.code}: ${p.message}`);
      setState("messages", (prev) =>
        prev.map((msg) => {
          if (msg.status === "pending") {
            this.pipeline.rejectPending(msg.id, convError);
            return { ...msg, status: "failed" as const };
          }
          return msg;
        }),
      );
    }
    console.error(`[DeliveryChat WS] Error: ${p.code} — ${p.message}`);
  }

  private clearTypingState(): void {
    setState("typingUser", null);
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }
  }

}
