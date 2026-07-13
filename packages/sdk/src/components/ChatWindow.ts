import type {
  WidgetSettings,
  ChatMessage,
  BubbleContext,
} from "../types/index.js";
import { createHeader } from "./Header.js";
import {
  createMessageList,
  appendMessage,
  updateMessageStatus,
  updateMessageContent,
  markMessageDeleted,
  enterEditMode,
  exitEditMode,
} from "./MessageList.js";
import { createInputArea } from "./InputArea.js";
import { createConnectionIndicator } from "./ConnectionIndicator.js";
import { createHumanHandoffButton } from "./HumanHandoffButton.js";

type ChatWindowCallbacks = {
  onSend: (text: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onClose?: () => void;
  onRequestHuman?: () => void;
};

type ChatWindowResult = {
  el: HTMLElement;
  destroy: () => void;
};

export function createChatWindow(
  settings: WidgetSettings,
  messages: ChatMessage[],
  callbacks: ChatWindowCallbacks,
  bubbleCtx: BubbleContext,
): ChatWindowResult {
  const container = document.createElement("div");
  container.className = "chat-window";
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-label", settings.header.title);

  const header = createHeader(settings.header, callbacks.onClose);
  const connectionIndicator = createConnectionIndicator();
  const humanHandoffButton = createHumanHandoffButton(() =>
    callbacks.onRequestHuman?.(),
  );
  const messageList = createMessageList(messages, bubbleCtx);
  const inputArea = createInputArea({
    onSend: callbacks.onSend,
    onTypingStart: callbacks.onTypingStart,
    onTypingStop: callbacks.onTypingStop,
  });

  const typingIndicator = document.createElement("div");
  typingIndicator.className = "typing-indicator";
  typingIndicator.hidden = true;
  messageList.appendChild(typingIndicator);

  const headerCloseBtn = header.querySelector(".header-close");
  if (headerCloseBtn) {
    header.insertBefore(humanHandoffButton, headerCloseBtn);
  } else {
    header.appendChild(humanHandoffButton);
  }
  header.appendChild(connectionIndicator);

  container.appendChild(header);
  container.appendChild(messageList);
  container.appendChild(inputArea.el);

  return {
    el: container,
    destroy: () => inputArea.destroy(),
  };
}

export function getMessageListEl(chatWindow: HTMLElement): HTMLElement | null {
  return chatWindow.querySelector(".message-list");
}

export {
  appendMessage,
  updateMessageStatus,
  updateMessageContent,
  markMessageDeleted,
  enterEditMode,
  exitEditMode,
  type BubbleContext,
};
