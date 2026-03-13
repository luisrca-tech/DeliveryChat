export function createInputArea(
  onSend: (text: string) => void
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

  const send = () => {
    const text = input.value.trim();
    if (text) {
      onSend(text);
      input.value = "";
    }
  };

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
