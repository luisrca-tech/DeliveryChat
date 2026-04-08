import type { WidgetSettings, ChatMessage } from "../types.js";
import { createHeader } from "./Header.js";
import { createMessageList, appendMessage, updateMessageStatus } from "./MessageList.js";
import { createInputArea } from "./InputArea.js";
import { createConnectionIndicator } from "./ConnectionIndicator.js";

export function createChatWindow(
  settings: WidgetSettings,
  messages: ChatMessage[],
  onSend: (text: string) => void,
  onClose?: () => void
): HTMLElement {
  const container = document.createElement("div");
  container.className = "chat-window";
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-label", settings.header.title);

  const header = createHeader(settings.header, onClose);
  const connectionIndicator = createConnectionIndicator();
  const messageList = createMessageList(messages);
  const inputArea = createInputArea(onSend);

  // Place connection indicator inside header
  header.appendChild(connectionIndicator);

  container.appendChild(header);
  container.appendChild(messageList);
  container.appendChild(inputArea);

  return container;
}

export function getMessageListEl(chatWindow: HTMLElement): HTMLElement | null {
  return chatWindow.querySelector(".message-list");
}

export { appendMessage, updateMessageStatus };
