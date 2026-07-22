import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MessageBubble } from "./MessageBubble";
import type { Message } from "../types/chat.types";

const HOSTILE_PAYLOADS = [
  `<script>window.__xss = true;</script>`,
  `<img src="x" onerror="window.__xss=true">`,
  `<svg onload="window.__xss=true"></svg>`,
  `<iframe src="javascript:alert(1)"></iframe>`,
  `<a href="javascript:alert(1)">click</a>`,
  `"><script>alert(1)</script>`,
];

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m-1",
    conversationId: "c-1",
    senderId: "visitor-1",
    senderName: "Visitor",
    senderRole: "visitor",
    type: "text",
    content: "hello",
    contentFormat: "plain",
    contentHtml: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("MessageBubble — hostile content rendering", () => {
  it.each(HOSTILE_PAYLOADS)("escapes %s as text content", (payload) => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({ content: payload })}
        isSelf={false}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    // Visitor/operator own SVG icons from lucide are allowed; user-provided svg/img should not appear.
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(screen.getByText(payload)).toBeTruthy();
  });

  it("never executes inline event handlers from user content", () => {
    const globalAny = globalThis as unknown as { __xss?: boolean };
    globalAny.__xss = false;

    render(
      <MessageBubble
        message={makeMessage({
          content: `<img src="x" onerror="window.__xss=true">`,
        })}
        isSelf={false}
      />,
    );

    expect(globalAny.__xss).toBe(false);
  });
});

describe("MessageBubble — AI authored messages", () => {
  it("labels AI-authored messages as 'AI Assistant' instead of the sender role", () => {
    render(
      <MessageBubble
        message={makeMessage({
          authorType: "ai",
          senderName: "Bot",
          senderRole: null,
          content: "Here is what I found.",
        })}
        isSelf={false}
      />,
    );

    expect(screen.getByText("AI Assistant")).toBeTruthy();
    expect(screen.queryByText("Bot")).toBeNull();
  });

  it("does not label a regular operator message as AI Assistant", () => {
    const { container } = render(
      <MessageBubble
        message={makeMessage({
          authorType: "operator",
          senderRole: "operator",
          senderName: "Maria",
        })}
        isSelf={false}
      />,
    );

    expect(within(container).queryByText("AI Assistant")).toBeNull();
    expect(within(container).getByText("Operator")).toBeTruthy();
  });
});
