import { TYPING_THROTTLE_MS } from "../constants/index.js";
import { subscribe } from "../state.js";

type InputCallbacks = {
  onSend: (text: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
};

type InputAreaResult = {
  el: HTMLElement;
  destroy: () => void;
};

export function createInputArea(callbacks: InputCallbacks): InputAreaResult {
  const container = document.createElement("div");
  container.className = "input-area";

  const rateLimitNotice = document.createElement("div");
  rateLimitNotice.className = "rate-limit-notice";
  rateLimitNotice.textContent =
    "You're sending messages too fast. Please wait a moment.";
  rateLimitNotice.style.display = "none";

  const textarea = document.createElement("textarea");
  textarea.placeholder = "Type a message...";
  textarea.setAttribute("aria-label", "Message input");
  textarea.rows = 1;
  textarea.className = "message-textarea";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "send-btn";
  btn.textContent = "Send";

  let lastTypingSent = 0;
  let isRateLimited = false;

  const autoResize = () => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  const send = () => {
    if (isRateLimited) return;
    const text = textarea.value.trim();
    if (text) {
      callbacks.onSend(text);
      textarea.value = "";
      autoResize();
      lastTypingSent = 0;
    }
  };

  textarea.addEventListener("input", () => {
    autoResize();

    if (textarea.value.length === 0) {
      callbacks.onTypingStop();
      lastTypingSent = 0;
      return;
    }

    const now = Date.now();
    if (now - lastTypingSent >= TYPING_THROTTLE_MS) {
      lastTypingSent = now;
      callbacks.onTypingStart();
    }
  });

  btn.addEventListener("click", send);
  textarea.addEventListener("keydown", (e) => {
    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey
    ) {
      e.preventDefault();
      send();
    }
  });

  const unsubscribe = subscribe("rateLimited", (limited) => {
    isRateLimited = limited;
    btn.disabled = limited;
    btn.classList.toggle("send-btn--disabled", limited);
    rateLimitNotice.style.display = limited ? "block" : "none";
  });

  const row = document.createElement("div");
  row.className = "input-row";
  row.appendChild(textarea);
  row.appendChild(btn);
  container.appendChild(rateLimitNotice);
  container.appendChild(row);

  return {
    el: container,
    destroy: () => unsubscribe(),
  };
}
