import { describe, expect, it } from "vitest";
import {
  appendMessage,
  createMessageList,
  markMessageDeleted,
  updateMessageContent,
  type BubbleContext,
} from "./MessageList.js";
import type { ChatMessage } from "../types.js";

const HOSTILE_PAYLOADS = [
  `<script>window.__xss = true;</script>`,
  `<img src="x" onerror="window.__xss=true">`,
  `<svg onload="window.__xss=true"></svg>`,
  `<iframe src="javascript:alert(1)"></iframe>`,
  `<a href="javascript:alert(1)">click</a>`,
  `"><script>alert(1)</script>`,
];

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m-1",
    content: "hello",
    senderRole: "visitor",
    senderId: "visitor-1",
    status: "sent",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeContext(overrides: Partial<BubbleContext> = {}): BubbleContext {
  return {
    visitorId: "visitor-1",
    onEdit: () => {},
    onDelete: () => {},
    ...overrides,
  };
}

describe("MessageList — hostile content rendering", () => {
  it.each(HOSTILE_PAYLOADS)(
    "renders %s as text in initial message list",
    (payload) => {
      const list = createMessageList(
        [makeMessage({ content: payload })],
        makeContext(),
      );

      const textEl = list.querySelector(".message-text");
      expect(textEl?.querySelectorAll("*")).toHaveLength(0);
      expect(textEl?.textContent).toBe(payload);
    },
  );

  it.each(HOSTILE_PAYLOADS)(
    "renders %s as text in appended messages",
    (payload) => {
      const list = createMessageList([], makeContext());
      appendMessage(list, makeMessage({ content: payload }), makeContext());

      const textEl = list.querySelector(".message-text");
      expect(textEl?.querySelectorAll("*")).toHaveLength(0);
      expect(textEl?.textContent).toBe(payload);
    },
  );

  it("renders hostile content as text when a message is edited", () => {
    const list = createMessageList(
      [makeMessage({ content: "benign" })],
      makeContext(),
    );

    const payload = `<script>window.__xss=true;</script>`;
    updateMessageContent(list, "m-1", payload, new Date().toISOString());

    const textEl = list.querySelector(".message-text");
    expect(textEl?.querySelectorAll("*")).toHaveLength(0);
    expect(textEl?.textContent).toBe(payload);
  });

  it("does not inject content from a subsequent delete call", () => {
    const list = createMessageList(
      [makeMessage({ content: "benign" })],
      makeContext(),
    );
    markMessageDeleted(list, "m-1");

    const wrapper = list.querySelector(".message-content-wrapper");
    expect(wrapper?.querySelector("script")).toBeNull();
    expect(list.querySelector(".message-deleted-text")?.textContent).toBe(
      "This message was deleted",
    );
  });

  it("never executes inline event handlers from user content", () => {
    const globalAny = globalThis as unknown as { __xss?: boolean };
    globalAny.__xss = false;

    const list = createMessageList(
      [
        makeMessage({
          content: `<img src="x" onerror="window.__xss=true">`,
        }),
      ],
      makeContext(),
    );
    document.body.appendChild(list);

    expect(globalAny.__xss).toBe(false);
    document.body.removeChild(list);
  });
});
