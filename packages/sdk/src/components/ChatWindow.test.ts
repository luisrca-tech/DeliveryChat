import { describe, expect, it, vi } from "vitest";
import { createChatWindow } from "./ChatWindow.js";
import { defaultSettings } from "../constants/index.js";
import type { BubbleContext } from "../types/index.js";

function makeCtx(): BubbleContext {
  return {
    visitorId: "visitor-1",
    onEdit: () => {},
    onDelete: () => {},
  };
}

describe("ChatWindow — human handoff button", () => {
  it("renders the human-handoff button in the header, hidden by default", () => {
    const { el } = createChatWindow(
      defaultSettings,
      [],
      {
        onSend: () => {},
        onTypingStart: () => {},
        onTypingStop: () => {},
      },
      makeCtx(),
    );

    const btn = el.querySelector(".human-handoff-btn") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.hidden).toBe(true);
    expect(el.querySelector(".header")?.contains(btn)).toBe(true);
  });

  it("invokes onRequestHuman when clicked", () => {
    const onRequestHuman = vi.fn();
    const { el } = createChatWindow(
      defaultSettings,
      [],
      {
        onSend: () => {},
        onTypingStart: () => {},
        onTypingStop: () => {},
        onRequestHuman,
      },
      makeCtx(),
    );

    const btn = el.querySelector(".human-handoff-btn") as HTMLButtonElement;
    btn.hidden = false;
    btn.click();

    expect(onRequestHuman).toHaveBeenCalledOnce();
  });
});
