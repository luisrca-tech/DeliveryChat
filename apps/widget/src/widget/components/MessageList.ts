import type { WidgetSettings } from "../types.js";

export function createMessageList(
  messages: Array<{ id: string; text: string; role: "user" | "visitor" }>
): HTMLElement {
  const list = document.createElement("div");
  list.className = "message-list";
  list.setAttribute("role", "log");
  list.setAttribute("aria-live", "polite");

  const fragment = document.createDocumentFragment();
  for (const msg of messages) {
    const bubble = document.createElement("div");
    bubble.className = `message-bubble message-${msg.role}`;
    bubble.textContent = msg.text;
    bubble.setAttribute("data-id", msg.id);
    fragment.appendChild(bubble);
  }
  list.appendChild(fragment);

  return list;
}

export function appendMessage(
  list: HTMLElement,
  message: { id: string; text: string; role: "user" | "visitor" }
): void {
  const bubble = document.createElement("div");
  bubble.className = `message-bubble message-${message.role}`;
  bubble.textContent = message.text;
  bubble.setAttribute("data-id", message.id);
  list.appendChild(bubble);
}
