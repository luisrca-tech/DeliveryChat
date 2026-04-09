type InputCallbacks = {
  onSend: (text: string) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
};

const TYPING_THROTTLE_MS = 2_000;

export function createInputArea(
  callbacks: InputCallbacks,
): HTMLElement {
  const container = document.createElement("div");
  container.className = "input-area";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type a message...";
  input.setAttribute("aria-label", "Message input");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "send-btn";
  btn.textContent = "Send";

  let lastTypingSent = 0;

  const send = () => {
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

  const row = document.createElement("div");
  row.className = "input-row";
  row.appendChild(input);
  row.appendChild(btn);
  container.appendChild(row);

  return container;
}
