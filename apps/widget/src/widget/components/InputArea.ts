import { TYPING_THROTTLE_MS } from "../constants/index.js";
import { subscribe } from "../state.js";

type InputCallbacks = {
  onSend: (text: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
};

export function createInputArea(
  callbacks: InputCallbacks,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "input-area";

  const rateLimitNotice = document.createElement("div");
  rateLimitNotice.className = "rate-limit-notice";
  rateLimitNotice.textContent =
    "You're sending messages too fast. Please wait a moment.";
  rateLimitNotice.style.display = "none";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type a message...";
  input.setAttribute("aria-label", "Message input");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "send-btn";
  btn.textContent = "Send";

  let lastTypingSent = 0;
  let isRateLimited = false;

  const send = () => {
    if (isRateLimited) return;
    const text = input.value.trim();
    if (text) {
      callbacks.onSend(text);
      input.value = "";
      lastTypingSent = 0;
    }
  };

  input.addEventListener("input", () => {
    if (input.value.length === 0) {
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
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });

  subscribe("rateLimited", (limited) => {
    isRateLimited = limited;
    btn.disabled = limited;
    btn.classList.toggle("send-btn--disabled", limited);
    rateLimitNotice.style.display = limited ? "block" : "none";
  });

  const row = document.createElement("div");
  row.className = "input-row";
  row.appendChild(input);
  row.appendChild(btn);
  container.appendChild(rateLimitNotice);
  container.appendChild(row);

  return container;
}
