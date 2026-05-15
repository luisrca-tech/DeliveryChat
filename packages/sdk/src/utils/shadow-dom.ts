const HOST_ID = "delivery-chat-root";

const shadowRoots = new WeakMap<HTMLElement, ShadowRoot>();

export function createShadowHost(): HTMLElement {
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    return existing;
  }

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:9999";
  document.body.appendChild(host);
  return host;
}

export function createShadowRoot(host: HTMLElement): ShadowRoot {
  const existing = shadowRoots.get(host);
  if (existing) {
    return existing;
  }

  const root = host.attachShadow({ mode: "closed" });
  shadowRoots.set(host, root);
  return root;
}

export function destroyHost(): void {
  const host = document.getElementById(HOST_ID);
  if (host) {
    host.remove();
  }
}
