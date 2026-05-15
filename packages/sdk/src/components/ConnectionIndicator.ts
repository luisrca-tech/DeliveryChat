import { subscribe, getState } from "../state.js";

export function createConnectionIndicator(): HTMLElement {
  const dot = document.createElement("div");
  dot.className = "connection-indicator";
  updateDot(dot, getState("connectionStatus"));

  subscribe("connectionStatus", (status) => {
    updateDot(dot, status);
  });

  return dot;
}

function updateDot(
  el: HTMLElement,
  status: "disconnected" | "connecting" | "connected",
): void {
  el.className = `connection-indicator connection-${status}`;
  el.title =
    status === "connected"
      ? "Connected"
      : status === "connecting"
        ? "Connecting..."
        : "Disconnected";
}
