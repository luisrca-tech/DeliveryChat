import { useEffect } from "react";

const API_BASE = "http://localhost:8000";
const APP_ID = "550e8400-e29b-41d4-a716-446655440000";

declare global {
  interface Window {
    DeliveryChat?: { init: (opts: unknown) => void };
  }
}

export function ChatWidgetEmbed() {
  useEffect(() => {
    const init = () => {
      window.DeliveryChat?.init({
        appId: APP_ID,
        apiBaseUrl: API_BASE,
        position: "bottom-right",
      });
    };

    if (window.DeliveryChat?.init) {
      init();
    } else {
      const script = document.createElement("script");
      script.src = "/widget.js";
      script.onload = init;
      document.body.appendChild(script);
    }
  }, []);

  return null;
}
