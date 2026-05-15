import { setState, getState } from "./state.js";
import { createConversation } from "./conversation.js";
import { saveConversationId, saveLastClientMessageId } from "./conversation-persistence.js";
import type { EventEmitter } from "./EventEmitter.js";
import type { SdkEventMap } from "./SdkEventMap.js";
import type { ChatMessage } from "./types/index.js";

const SEND_TIMEOUT_MS = 15_000;

type Resolver = {
  resolve: (msg: ChatMessage) => void;
  reject: (err: Error) => void;
};

type MessagePipelineOptions = {
  sendWS: (event: object) => void;
  emitter: EventEmitter<SdkEventMap>;
};

type SendConfig = {
  appId: string;
  apiBaseUrl: string;
};

export class MessagePipeline {
  private pending = new Map<string, Resolver>();
  private readonly sendWS: MessagePipelineOptions["sendWS"];
  private readonly emitter: MessagePipelineOptions["emitter"];

  constructor(options: MessagePipelineOptions) {
    this.sendWS = options.sendWS;
    this.emitter = options.emitter;
  }

  async send(content: string, config: SendConfig): Promise<ChatMessage> {
    const visitorId = getState("visitorId");
    if (!visitorId) {
      throw new Error("[DeliveryChat] Visitor not initialized.");
    }
    if (getState("conversationStatus") === "closed") {
      throw new Error("[DeliveryChat] Conversation is closed.");
    }
    if (getState("rateLimited")) {
      throw new Error("[DeliveryChat] Rate limited. Try again later.");
    }

    const clientMessageId = crypto.randomUUID();

    const optimistic: ChatMessage = {
      id: clientMessageId,
      content,
      type: "text",
      senderRole: "visitor",
      senderId: visitorId,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    setState("messages", (prev: ChatMessage[]) => [...prev, optimistic]);

    let conversationId = getState("conversationId");
    if (!conversationId) {
      try {
        const result = await createConversation(
          config.apiBaseUrl,
          config.appId,
          visitorId,
        );
        conversationId = result.conversation.id;
        setState("conversationId", conversationId);
        setState("conversationStatus", "pending");
        saveConversationId(config.appId, conversationId);

        this.sendWS({
          type: "room:join",
          payload: { conversationId },
        });
      } catch (err) {
        setState("messages", (prev: ChatMessage[]) =>
          prev.map((m) =>
            m.id === clientMessageId ? { ...m, status: "failed" as const } : m,
          ),
        );
        throw new Error(
          `[DeliveryChat] Failed to create conversation: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const ackPromise = this.trackPending(clientMessageId);

    this.sendWS({
      type: "message:send",
      payload: { conversationId, content, clientMessageId },
    });

    saveLastClientMessageId(config.appId, clientMessageId);

    return ackPromise;
  }

  processAck(payload: {
    clientMessageId: string;
    serverMessageId: string;
    createdAt: string;
  }): void {
    let ackedMsg: ChatMessage | undefined;
    setState("messages", (prev: ChatMessage[]) =>
      prev.map((msg) => {
        if (msg.id === payload.clientMessageId) {
          ackedMsg = {
            ...msg,
            id: payload.serverMessageId,
            status: "sent" as const,
            createdAt: payload.createdAt,
          };
          return ackedMsg;
        }
        return msg;
      }),
    );

    if (ackedMsg) {
      this.emitter.emit("message:sent", ackedMsg);
      this.resolvePending(payload.clientMessageId, ackedMsg);
    }
  }

  processIncoming(msg: ChatMessage): void {
    const visitorId = getState("visitorId");
    if (msg.senderId !== visitorId && msg.status === "sent") {
      this.emitter.emit("message:received", msg);
    }
  }

  rejectPending(clientMessageId: string, error: Error): void {
    this.pending.get(clientMessageId)?.reject(error);
  }

  clearAllPending(): void {
    const destroyError = new Error("[DeliveryChat] SDK destroyed");
    for (const [, resolver] of this.pending) {
      resolver.reject(destroyError);
    }
    this.pending.clear();
  }

  private trackPending(clientMessageId: string): Promise<ChatMessage> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(clientMessageId);
        reject(new Error("[DeliveryChat] Message send timed out"));
      }, SEND_TIMEOUT_MS);

      this.pending.set(clientMessageId, {
        resolve: (msg) => {
          clearTimeout(timeoutId);
          this.pending.delete(clientMessageId);
          resolve(msg);
        },
        reject: (err) => {
          clearTimeout(timeoutId);
          this.pending.delete(clientMessageId);
          reject(err);
        },
      });
    });
  }

  private resolvePending(clientMessageId: string, msg: ChatMessage): void {
    this.pending.get(clientMessageId)?.resolve(msg);
  }
}
