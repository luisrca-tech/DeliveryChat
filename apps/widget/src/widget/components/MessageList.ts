import type { ChatMessage } from "../types.js";

export function createMessageList(
  messages: ChatMessage[],
): HTMLElement {
  const list = document.createElement("div");
  list.className = "message-list";
  list.setAttribute("role", "log");
  list.setAttribute("aria-live", "polite");

  const fragment = document.createDocumentFragment();
  for (const msg of messages) {
    fragment.appendChild(createBubble(msg));
  }
  list.appendChild(fragment);

  return list;
}

export function appendMessage(
  list: HTMLElement,
  message: ChatMessage,
): void {
  const typingEl = list.querySelector(".typing-indicator");
  const bubble = createBubble(message);
  if (typingEl) {
    list.insertBefore(bubble, typingEl);
  } else {
    list.appendChild(bubble);
  }
  list.scrollTop = list.scrollHeight;
}

export function updateMessageStatus(
  list: HTMLElement,
  messageId: string,
  newId: string,
  status: "sent" | "failed",
): void {
  const el = list.querySelector(`[data-id="${messageId}"]`);
  if (!el) return;
  el.setAttribute("data-id", newId);
  el.classList.remove("message-pending");
  el.classList.add(status === "sent" ? "message-sent" : "message-failed");
}

function createBubble(msg: ChatMessage): HTMLElement {
  const bubble = document.createElement("div");

  const isVisitor = msg.senderRole === "visitor";
  const roleClass = isVisitor ? "message-user" : "message-visitor";
  const statusClass = msg.status === "pending" ? "message-pending" : "";

  bubble.className = `message-bubble ${roleClass} ${statusClass}`.trim();
  bubble.textContent = msg.content;
  bubble.setAttribute("data-id", msg.id);

  return bubble;
}
