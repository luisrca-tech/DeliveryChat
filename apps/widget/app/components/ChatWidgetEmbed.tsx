import { useEffect } from "react";

const APP_ID = "e2af1739-f35d-4a50-a4f8-d787e92924d6";

const getDeliveryChat = () =>
  (window as unknown as { DeliveryChat?: { init: (opts: unknown) => void } })
    .DeliveryChat;

export function ChatWidgetEmbed() {
  useEffect(() => {
    const init = () => {
      getDeliveryChat()?.init({
        appId: APP_ID,
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
