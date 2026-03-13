import { useEffect, useRef } from "react";
const WIDGET_COLORS = [
  { primary: "#6366f1", background: "#faf5ff", userBubble: "#8b5cf6" },
  { primary: "#ec4899", background: "#fdf2f8", userBubble: "#f472b6" },
  { primary: "#059669", background: "#ecfdf5", userBubble: "#34d399" },
  { primary: "#d97706", background: "#fffbeb", userBubble: "#fbbf24" },
];

declare global {
  interface Window {
    DeliveryChat?: { init: (opts: unknown) => void };
  }
}

export function ChatWidgetTest({ appId }: { appId: string }) {
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current || !appId) return;
    loaded.current = true;

    const colors =
      WIDGET_COLORS[Math.floor(Math.random() * WIDGET_COLORS.length)];

    const init = () => {
      window.DeliveryChat?.init({
        appId,
        position: "bottom-left",
        autoOpen: true,
        autoOpenDelay: 2000,
        colors,
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
  }, [appId]);

  return null;
}
