import type { WidgetSettings } from "../types.js";
import { createHeader } from "./Header.js";
import { createMessageList, appendMessage } from "./MessageList.js";
import { createInputArea } from "./InputArea.js";

export function createChatWindow(
  settings: WidgetSettings,
  messages: Array<{ id: string; text: string; role: "user" | "visitor" }>,
  onSend: (text: string) => void,
  onClose?: () => void
): HTMLElement {
  const container = document.createElement("div");
  container.className = "chat-window";
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-label", settings.header.title);

  const header = createHeader(settings.header, onClose);
  const messageList = createMessageList(messages);
  const inputArea = createInputArea(onSend);

  container.appendChild(header);
  container.appendChild(messageList);
  container.appendChild(inputArea);

  return container;
}

export function getMessageListEl(chatWindow: HTMLElement): HTMLElement | null {
  return chatWindow.querySelector(".message-list");
}

export { appendMessage };
