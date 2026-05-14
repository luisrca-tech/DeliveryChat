import { describe, expect, it } from "vitest";
import {
  appendMessage,
  createMessageList,
  markMessageDeleted,
  updateMessageContent,
  type BubbleContext,
} from "./MessageList.js";
import type { ChatMessage } from "../types/index.js";

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
    type: "text",
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

describe("MessageList — system messages", () => {
  it("renders system messages as centered muted text, not chat bubbles", () => {
    const list = createMessageList(
      [makeMessage({ type: "system", content: "Alice joined the conversation", senderId: "" })],
      makeContext(),
    );

    const row = list.querySelector(".message-row-system");
    expect(row).not.toBeNull();
    expect(row?.querySelector(".message-system-text")?.textContent).toBe(
      "Alice joined the conversation",
    );
    expect(row?.querySelector(".message-bubble")).toBeNull();
  });

  it("does not render edit/delete controls for system messages", () => {
    const list = createMessageList(
      [makeMessage({ type: "system", content: "Alice left the conversation", senderId: "" })],
      makeContext(),
    );

    expect(list.querySelector(".message-more-btn")).toBeNull();
    expect(list.querySelector(".message-dropdown")).toBeNull();
  });

  it("renders system messages via appendMessage with correct styling", () => {
    const list = createMessageList([], makeContext());
    appendMessage(
      list,
      makeMessage({ type: "system", content: "Alice resolved the conversation", senderId: "" }),
      makeContext(),
    );

    const row = list.querySelector(".message-row-system");
    expect(row).not.toBeNull();
    expect(row?.querySelector(".message-system-text")?.textContent).toBe(
      "Alice resolved the conversation",
    );
  });

  it("renders regular text messages normally alongside system messages", () => {
    const list = createMessageList(
      [
        makeMessage({ id: "m-1", type: "text", content: "hello" }),
        makeMessage({ id: "m-2", type: "system", content: "Alice joined the conversation", senderId: "" }),
        makeMessage({ id: "m-3", type: "text", content: "hi there", senderRole: "operator", senderId: "op-1" }),
      ],
      makeContext(),
    );

    const rows = list.querySelectorAll(".message-row, .message-row-system");
    expect(rows).toHaveLength(3);
    expect(rows[0]?.classList.contains("message-row-user")).toBe(true);
    expect(rows[1]?.classList.contains("message-row-system")).toBe(true);
    expect(rows[2]?.classList.contains("message-row-visitor")).toBe(true);
  });
});

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
