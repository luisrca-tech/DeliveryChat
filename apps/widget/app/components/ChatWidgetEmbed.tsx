import { useEffect } from "react";

const APP_ID =
  (import.meta.env.VITE_WIDGET_APP_ID as string | undefined) ??
  "e2af1739-f35d-4a50-a4f8-d787e92924d6";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;

const getDeliveryChat = () =>
  (window as unknown as { DeliveryChat?: { init: (opts: unknown) => void } })
    .DeliveryChat;

export function ChatWidgetEmbed() {
  useEffect(() => {
    // Skip auto-init on playground — it handles its own init
    if (window.location.pathname === "/playground") return;

    const init = () => {
      getDeliveryChat()?.init({
        appId: APP_ID,
        apiBaseUrl: API_BASE_URL,
        position: "bottom-right",
      });
    };

    if (getDeliveryChat()?.init) {
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
