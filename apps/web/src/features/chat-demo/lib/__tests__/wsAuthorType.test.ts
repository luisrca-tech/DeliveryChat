import { describe, it, expect } from "vitest";
import { wsMessageReducer } from "../wsMessageReducer";
import type { WsReducerState } from "../wsMessageReducer";

const emptyState: WsReducerState = {
  messages: [],
  conversations: [],
  operatorTypingName: null,
};

function messageNewEvent(authorType?: string) {
  return {
    type: "message:new",
    payload: {
      id: "msg-1",
      conversationId: "conv-1",
      senderId: "sender-1",
      content: "Premium costs R$ 240.",
      createdAt: "2026-07-21T00:00:00.000Z",
      type: "text",
      ...(authorType !== undefined && { authorType }),
    },
  };
}

describe("wsMessageReducer — authorType passthrough", () => {
  it("preserves authorType:'ai' so the bubble can be styled as AI", () => {
    const { state } = wsMessageReducer(
      emptyState,
      messageNewEvent("ai"),
      "conv-1",
    );
    expect(state.messages[0]?.authorType).toBe("ai");
  });

  it("preserves authorType:'operator'", () => {
    const { state } = wsMessageReducer(
      emptyState,
      messageNewEvent("operator"),
      "conv-1",
    );
    expect(state.messages[0]?.authorType).toBe("operator");
  });

  it("leaves authorType undefined when the server omits it", () => {
    // The field is optional for backward compatibility — an older payload must
    // still produce a renderable message, just without AI styling.
    const { state } = wsMessageReducer(emptyState, messageNewEvent(), "conv-1");
    expect(state.messages[0]?.authorType).toBeUndefined();
    expect(state.messages[0]?.content).toBe("Premium costs R$ 240.");
  });
});
