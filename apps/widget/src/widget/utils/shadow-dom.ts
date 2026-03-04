const HOST_ID = "delivery-chat-root";

export function createShadowHost(): HTMLElement {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    return existing;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText =
    "position:fixed;inset:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:9999";
  document.body.appendChild(host);
  return host;
}

export function createShadowRoot(host: HTMLElement): ShadowRoot {
  if (host.shadowRoot) {
    return host.shadowRoot;
  }
  return host.attachShadow({ mode: "closed" });
}

export function destroyHost(): void {
  const host = document.getElementById(HOST_ID);
  if (host) {
    host.remove();
  }
}
