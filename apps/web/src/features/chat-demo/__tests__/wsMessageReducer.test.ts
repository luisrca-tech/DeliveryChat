import { describe, it, expect } from "vitest";
import {
  wsMessageReducer,
  type WsReducerState,
  type OptimisticMessage,
} from "../lib/wsMessageReducer";
import type { Conversation } from "../chat-client";

function makeState(overrides?: Partial<WsReducerState>): WsReducerState {
  return {
    messages: [],
    conversations: [],
    operatorTypingName: null,
    ...overrides,
  };
}

function makeConversation(overrides?: Partial<Conversation>): Conversation {
  return {
    id: "conv-1",
    status: "active",
    subject: "Test",
    assignedTo: "op-1",
    participants: [],
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeMessage(overrides?: Partial<OptimisticMessage>): OptimisticMessage {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    senderId: "user-1",
    content: "Hello",
    createdAt: "2024-01-01T00:00:00Z",
    editedAt: null,
    ...overrides,
  };
}

// ---- message:ack ----

describe("wsMessageReducer / message:ack", () => {
  it("replaces an optimistic message matched by clientId", () => {
    const optimistic = makeMessage({ id: "tmp-1", clientId: "tmp-1", pending: true });
    const state = makeState({ messages: [optimistic] });

    const { state: next, sideEffects } = wsMessageReducer(
      state,
      {
        type: "message:ack",
        payload: { clientMessageId: "tmp-1", serverMessageId: "srv-1", createdAt: "2024-01-02T00:00:00Z" },
      },
      "conv-1",
    );

    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]!.id).toBe("srv-1");
    expect(next.messages[0]!.pending).toBe(false);
    expect(next.messages[0]!.clientId).toBeUndefined();
    expect(next.messages[0]!.createdAt).toBe("2024-01-02T00:00:00Z");
    expect(sideEffects).toContainEqual({
      kind: "persist-last-message",
      conversationId: "conv-1",
      messageId: "srv-1",
    });
  });

  it("returns unchanged messages when clientId is unknown", () => {
    const msg = makeMessage({ id: "msg-1" });
    const state = makeState({ messages: [msg] });

    const { state: next, sideEffects } = wsMessageReducer(
      state,
      {
        type: "message:ack",
        payload: { clientMessageId: "unknown-id", serverMessageId: "srv-1", createdAt: "2024-01-02T00:00:00Z" },
      },
      "conv-1",
    );

    expect(next.messages).toEqual([msg]);
    expect(sideEffects).toContainEqual({
      kind: "persist-last-message",
      conversationId: "conv-1",
      messageId: "srv-1",
    });
  });

  it("emits no persist-last-message side effect when selectedConversationId is null", () => {
    const optimistic = makeMessage({ id: "tmp-1", clientId: "tmp-1", pending: true });
    const state = makeState({ messages: [optimistic] });

    const { sideEffects } = wsMessageReducer(
      state,
      {
        type: "message:ack",
        payload: { clientMessageId: "tmp-1", serverMessageId: "srv-1", createdAt: "2024-01-02T00:00:00Z" },
      },
      null,
    );

    expect(sideEffects).toHaveLength(0);
  });
});

// ---- message:new ----

describe("wsMessageReducer / message:new", () => {
  it("appends a new message to the selected conversation", () => {
    const state = makeState({ messages: [] });

    const { state: next, sideEffects } = wsMessageReducer(
      state,
      {
        type: "message:new",
        payload: {
          id: "msg-2",
          conversationId: "conv-1",
          senderId: "op-1",
          content: "Hi there",
          createdAt: "2024-01-01T01:00:00Z",
        },
      },
      "conv-1",
    );

    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]!.id).toBe("msg-2");
    expect(next.operatorTypingName).toBeNull();
    expect(sideEffects).toContainEqual({ kind: "persist-last-message", conversationId: "conv-1", messageId: "msg-2" });
    expect(sideEffects).toContainEqual({ kind: "mark-as-read", conversationId: "conv-1", messageId: "msg-2" });
  });

  it("is idempotent — does not append a duplicate message", () => {
    const existing = makeMessage({ id: "msg-2" });
    const state = makeState({ messages: [existing] });

    const { state: next, sideEffects } = wsMessageReducer(
      state,
      {
        type: "message:new",
        payload: {
          id: "msg-2",
          conversationId: "conv-1",
          senderId: "op-1",
          content: "Hi there",
          createdAt: "2024-01-01T01:00:00Z",
        },
      },
      "conv-1",
    );

    expect(next.messages).toHaveLength(1);
    expect(sideEffects).toHaveLength(0);
  });

  it("clears operatorTypingName when a message arrives in selected conversation", () => {
    const state = makeState({ operatorTypingName: "Alice" });

    const { state: next } = wsMessageReducer(
      state,
      {
        type: "message:new",
        payload: { id: "msg-2", conversationId: "conv-1", senderId: "op-1", content: "Hey", createdAt: "2024-01-01T01:00:00Z" },
      },
      "conv-1",
    );

    expect(next.operatorTypingName).toBeNull();
  });

  it("emits refresh-unread for a non-selected conversation", () => {
    const state = makeState();

    const { state: next, sideEffects } = wsMessageReducer(
      state,
      {
        type: "message:new",
        payload: { id: "msg-3", conversationId: "conv-2", senderId: "op-1", content: "Hey", createdAt: "2024-01-01T01:00:00Z" },
      },
      "conv-1",
    );

    expect(next.messages).toHaveLength(0);
    expect(sideEffects).toContainEqual({ kind: "refresh-unread", conversationId: "conv-2" });
  });
});

// ---- messages:sync ----

describe("wsMessageReducer / messages:sync", () => {
  it("merges new messages from sync into state", () => {
    const existing = makeMessage({ id: "msg-1" });
    const newMsg = makeMessage({ id: "msg-2" });
    const state = makeState({ messages: [existing] });

    const { state: next, sideEffects } = wsMessageReducer(
      state,
      {
        type: "messages:sync",
        payload: { conversationId: "conv-1", messages: [existing, newMsg] },
      },
      "conv-1",
    );

    expect(next.messages).toHaveLength(2);
    expect(next.messages[1]!.id).toBe("msg-2");
    expect(sideEffects).toContainEqual({
      kind: "persist-last-message",
      conversationId: "conv-1",
      messageId: "msg-2",
    });
  });

  it("returns unchanged state when sync payload is empty", () => {
    const state = makeState({ messages: [makeMessage()] });

    const { state: next, sideEffects } = wsMessageReducer(
      state,
      { type: "messages:sync", payload: { conversationId: "conv-1", messages: [] } },
      "conv-1",
    );

    expect(next.messages).toHaveLength(1);
    expect(sideEffects).toHaveLength(0);
  });

  it("returns unchanged state when all synced messages are already present", () => {
    const msg = makeMessage({ id: "msg-1" });
    const state = makeState({ messages: [msg] });

    const { state: next, sideEffects } = wsMessageReducer(
      state,
      { type: "messages:sync", payload: { conversationId: "conv-1", messages: [msg] } },
      "conv-1",
    );

    expect(next).toBe(state);
    expect(sideEffects).toHaveLength(0);
  });

  it("ignores sync for a different conversation", () => {
    const state = makeState();

    const { state: next } = wsMessageReducer(
      state,
      { type: "messages:sync", payload: { conversationId: "conv-2", messages: [makeMessage({ conversationId: "conv-2" })] } },
      "conv-1",
    );

    expect(next.messages).toHaveLength(0);
  });
});

// ---- message:edited ----

describe("wsMessageReducer / message:edited", () => {
  it("updates message content and editedAt in selected conversation", () => {
    const msg = makeMessage({ id: "msg-1" });
    const state = makeState({ messages: [msg] });

    const { state: next } = wsMessageReducer(
      state,
      {
        type: "message:edited",
        payload: { id: "msg-1", conversationId: "conv-1", content: "Updated content", editedAt: "2024-01-01T02:00:00Z" },
      },
      "conv-1",
    );

    expect(next.messages[0]!.content).toBe("Updated content");
    expect(next.messages[0]!.editedAt).toBe("2024-01-01T02:00:00Z");
  });

  it("does not modify messages for a different conversation", () => {
    const msg = makeMessage({ id: "msg-1" });
    const state = makeState({ messages: [msg] });

    const { state: next } = wsMessageReducer(
      state,
      { type: "message:edited", payload: { id: "msg-1", conversationId: "conv-2", content: "x", editedAt: "2024-01-01T02:00:00Z" } },
      "conv-1",
    );

    expect(next).toBe(state);
  });
});

// ---- message:deleted ----

describe("wsMessageReducer / message:deleted", () => {
  it("removes the message from the selected conversation", () => {
    const msg1 = makeMessage({ id: "msg-1" });
    const msg2 = makeMessage({ id: "msg-2" });
    const state = makeState({ messages: [msg1, msg2] });

    const { state: next } = wsMessageReducer(
      state,
      { type: "message:deleted", payload: { id: "msg-1", conversationId: "conv-1" } },
      "conv-1",
    );

    expect(next.messages).toHaveLength(1);
    expect(next.messages[0]!.id).toBe("msg-2");
  });

  it("returns unchanged state when the message ID does not exist", () => {
    const msg = makeMessage({ id: "msg-1" });
    const state = makeState({ messages: [msg] });

    const { state: next } = wsMessageReducer(
      state,
      { type: "message:deleted", payload: { id: "non-existent", conversationId: "conv-1" } },
      "conv-1",
    );

    expect(next.messages).toHaveLength(1);
  });

  it("does not remove messages for a different conversation", () => {
    const msg = makeMessage({ id: "msg-1" });
    const state = makeState({ messages: [msg] });

    const { state: next } = wsMessageReducer(
      state,
      { type: "message:deleted", payload: { id: "msg-1", conversationId: "conv-2" } },
      "conv-1",
    );

    expect(next).toBe(state);
  });
});

// ---- typing:start ----

describe("wsMessageReducer / typing:start", () => {
  it("sets operatorTypingName to the provided userName", () => {
    const state = makeState();

    const { state: next } = wsMessageReducer(
      state,
      { type: "typing:start", payload: { conversationId: "conv-1", userName: "Alice" } },
      "conv-1",
    );

    expect(next.operatorTypingName).toBe("Alice");
  });

  it("defaults to 'Operator' when userName is null", () => {
    const state = makeState();

    const { state: next } = wsMessageReducer(
      state,
      { type: "typing:start", payload: { conversationId: "conv-1", userName: null } },
      "conv-1",
    );

    expect(next.operatorTypingName).toBe("Operator");
  });

  it("ignores typing:start for a different conversation", () => {
    const state = makeState();

    const { state: next } = wsMessageReducer(
      state,
      { type: "typing:start", payload: { conversationId: "conv-2", userName: "Alice" } },
      "conv-1",
    );

    expect(next).toBe(state);
  });
});

// ---- typing:stop ----

describe("wsMessageReducer / typing:stop", () => {
  it("clears operatorTypingName", () => {
    const state = makeState({ operatorTypingName: "Alice" });

    const { state: next } = wsMessageReducer(
      state,
      { type: "typing:stop", payload: { conversationId: "conv-1" } },
      "conv-1",
    );

    expect(next.operatorTypingName).toBeNull();
  });

  it("ignores typing:stop for a different conversation", () => {
    const state = makeState({ operatorTypingName: "Alice" });

    const { state: next } = wsMessageReducer(
      state,
      { type: "typing:stop", payload: { conversationId: "conv-2" } },
      "conv-1",
    );

    expect(next).toBe(state);
  });
});

// ---- conversation:accepted ----

describe("wsMessageReducer / conversation:accepted", () => {
  it("sets conversation status to active and updates assignedTo", () => {
    const conv = makeConversation({ id: "conv-1", status: "pending", assignedTo: null });
    const state = makeState({ conversations: [conv] });

    const { state: next } = wsMessageReducer(
      state,
      { type: "conversation:accepted", payload: { conversationId: "conv-1", assignedTo: "op-2" } },
      "conv-1",
    );

    expect(next.conversations[0]!.status).toBe("active");
    expect(next.conversations[0]!.assignedTo).toBe("op-2");
  });

  it("does not mutate the input state", () => {
    const conv = makeConversation({ id: "conv-1", status: "pending" });
    const state = makeState({ conversations: [conv] });

    wsMessageReducer(
      state,
      { type: "conversation:accepted", payload: { conversationId: "conv-1", assignedTo: "op-2" } },
      "conv-1",
    );

    expect(state.conversations[0]!.status).toBe("pending");
  });
});

// ---- conversation:released ----

describe("wsMessageReducer / conversation:released", () => {
  it("sets conversation status to pending and clears assignedTo", () => {
    const conv = makeConversation({ id: "conv-1", status: "active", assignedTo: "op-1" });
    const state = makeState({ conversations: [conv] });

    const { state: next } = wsMessageReducer(
      state,
      { type: "conversation:released", payload: { conversationId: "conv-1" } },
      "conv-1",
    );

    expect(next.conversations[0]!.status).toBe("pending");
    expect(next.conversations[0]!.assignedTo).toBeNull();
  });
});

// ---- conversation:resolved ----

describe("wsMessageReducer / conversation:resolved", () => {
  it("sets conversation status to closed", () => {
    const conv = makeConversation({ id: "conv-1", status: "active" });
    const state = makeState({ conversations: [conv] });

    const { state: next } = wsMessageReducer(
      state,
      { type: "conversation:resolved", payload: { conversationId: "conv-1" } },
      "conv-1",
    );

    expect(next.conversations[0]!.status).toBe("closed");
  });

  it("emits close-socket side effect when the resolved conversation is selected", () => {
    const conv = makeConversation({ id: "conv-1", status: "active" });
    const state = makeState({ conversations: [conv] });

    const { sideEffects } = wsMessageReducer(
      state,
      { type: "conversation:resolved", payload: { conversationId: "conv-1" } },
      "conv-1",
    );

    expect(sideEffects).toContainEqual({ kind: "close-socket" });
  });

  it("does not emit close-socket when a different conversation is resolved", () => {
    const conv = makeConversation({ id: "conv-2", status: "active" });
    const state = makeState({ conversations: [conv] });

    const { sideEffects } = wsMessageReducer(
      state,
      { type: "conversation:resolved", payload: { conversationId: "conv-2" } },
      "conv-1",
    );

    expect(sideEffects).not.toContainEqual({ kind: "close-socket" });
  });
});

// ---- unknown event ----

describe("wsMessageReducer / unknown event", () => {
  it("returns the same state reference for unknown event types", () => {
    const state = makeState();

    const { state: next, sideEffects } = wsMessageReducer(
      state,
      { type: "unknown:event", payload: {} },
      "conv-1",
    );

    expect(next).toBe(state);
    expect(sideEffects).toHaveLength(0);
  });
});

// ---- pure function contract ----

describe("wsMessageReducer / pure function contract", () => {
  it("does not mutate the input messages array", () => {
    const messages = [makeMessage()];
    const state = makeState({ messages });

    wsMessageReducer(
      state,
      {
        type: "message:new",
        payload: { id: "msg-2", conversationId: "conv-1", senderId: "op-1", content: "Hey", createdAt: "2024-01-01T01:00:00Z" },
      },
      "conv-1",
    );

    expect(messages).toHaveLength(1);
  });

  it("does not mutate the input conversations array", () => {
    const conversations = [makeConversation({ status: "pending" })];
    const state = makeState({ conversations });

    wsMessageReducer(
      state,
      { type: "conversation:accepted", payload: { conversationId: "conv-1", assignedTo: "op-2" } },
      "conv-1",
    );

    expect(conversations[0]!.status).toBe("pending");
  });
});
