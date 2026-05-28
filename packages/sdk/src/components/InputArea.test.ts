import { describe, expect, it, vi } from "vitest";
import { createInputArea } from "./InputArea.js";

function makeCallbacks() {
  return {
    onSend: vi.fn(),
    onTypingStart: vi.fn(),
    onTypingStop: vi.fn(),
  };
}

function setTextareaValue(container: HTMLElement, value: string) {
  const textarea = container.querySelector("textarea")!;
  textarea.value = value;
  return textarea;
}

function pressKey(
  textarea: HTMLTextAreaElement,
  key: string,
  modifiers: Partial<KeyboardEventInit> = {},
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  textarea.dispatchEvent(event);
  return event;
}

describe("InputArea — Enter key behavior", () => {
  it("sends message on plain Enter", () => {
    const cbs = makeCallbacks();
    const { el } = createInputArea(cbs);
    const textarea = setTextareaValue(el, "hello");

    pressKey(textarea, "Enter");

    expect(cbs.onSend).toHaveBeenCalledWith("hello");
  });

  it("does not send on Shift+Enter", () => {
    const cbs = makeCallbacks();
    const { el } = createInputArea(cbs);
    const textarea = setTextareaValue(el, "hello");

    pressKey(textarea, "Enter", { shiftKey: true });

    expect(cbs.onSend).not.toHaveBeenCalled();
  });

  it("does not send on Ctrl+Enter", () => {
    const cbs = makeCallbacks();
    const { el } = createInputArea(cbs);
    const textarea = setTextareaValue(el, "hello");

    pressKey(textarea, "Enter", { ctrlKey: true });

    expect(cbs.onSend).not.toHaveBeenCalled();
  });

  it("does not send on Alt+Enter", () => {
    const cbs = makeCallbacks();
    const { el } = createInputArea(cbs);
    const textarea = setTextareaValue(el, "hello");

    pressKey(textarea, "Enter", { altKey: true });

    expect(cbs.onSend).not.toHaveBeenCalled();
  });

  it("does not send on Meta+Enter", () => {
    const cbs = makeCallbacks();
    const { el } = createInputArea(cbs);
    const textarea = setTextareaValue(el, "hello");

    pressKey(textarea, "Enter", { metaKey: true });

    expect(cbs.onSend).not.toHaveBeenCalled();
  });
});
