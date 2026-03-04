# How Embeddable Chat Widgets Work

This document explains how the Delivery Chat widget works, using industry-standard patterns from Intercom, Drift, Crisp, and Tidio.

---

## 1. The Embed Pattern

To add chat to their website, customers include a script tag and call `DeliveryChat.init()`:

```html
<script src="https://your-cdn.com/widget.js"></script>
<script>
  DeliveryChat.init({
    appId: "your-app-uuid",
    apiBaseUrl: "https://api.yourdomain.com",
    position: "bottom-right",
  });
</script>
```

**Similar patterns used by:**

- **Intercom:** `window.Intercom('boot', { app_id: 'xxx' })`
- **Drift:** Embed code with widget ID
- **Crisp:** Widget ID in script URL
- **Tidio:** Widget ID in script URL

---

## 2. How It Loads

```
Customer Website                    Your Server
      │                                    │
      │  ───── fetches widget.js ────────► │  (static bundle)
      │                                    │
      ▼                                    │
DeliveryChat.init({ appId, ... })          │
```

The `widget.js` bundle is self-contained (~12KB gzipped) and:

- Has no external dependencies
- Works on any website (React, Vue, plain HTML)
- Can be served from a CDN

---

## 3. Shadow DOM — Style Isolation

**Problem:** Widget CSS can conflict with the customer's site CSS, and vice versa.

**Solution:** Shadow DOM creates an isolated DOM tree. Styles inside the shadow root do not leak out, and the host page's styles do not leak in.

```
Customer's DOM                    Shadow DOM (inside #delivery-chat-root)
     │                                        │
     │                              ┌─────────┴─────────┐
     │                              │  .chat-widget     │
     │                              │    ├── .launcher  │
     │                              │    └── .chat-win  │
     │                              │  All styles here  │
     │                              │  are isolated!     │
     │                              └───────────────────┘
```

**Implementation** (`shadow-dom.ts`):

```typescript
export function createShadowHost(): HTMLElement {
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "position:fixed;inset:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:9999";
  document.body.appendChild(host);
  return host;
}

export function createShadowRoot(host: HTMLElement): ShadowRoot {
  return host.attachShadow({ mode: "closed" }); // "closed" = not accessible from outside
}
```

---

## 4. CSS Custom Properties — Theming

**Problem:** How to let customers customize colors without inline styles?

**Solution:** CSS variables + Shadow DOM. The API returns settings; the widget applies them as CSS custom properties.

**Flow:**

1. API returns: `{ colors: { primary: "#6366f1" } }`
2. JS applies: `root.style.setProperty("--dc-primary-color", settings.colors.primary)`
3. CSS uses: `background: var(--dc-primary-color, #0ea5e9)`

**Implementation** (`css-vars.ts`):

```typescript
export function applyCssVars(root: HTMLElement, settings: WidgetSettings): void {
  root.style.setProperty("--dc-primary-color", settings.colors.primary);
  root.style.setProperty("--dc-background-color", settings.colors.background);
  // ... etc
}
```

This keeps styling declarative and allows overrides without inline styles.

---

## 5. The Settings Flow

```
Customer Website          Your API              Database
      │                       │                     │
      │  DeliveryChat.init()  │                     │
      │  { appId }            │                     │
      │ ───────────────────►  │  GET /v1/widget/    │
      │                        │  settings/:appId   │
      │                        │ ─────────────────► │  applications
      │                        │                    │  .settings (JSONB)
      │                        │ ◄─────────────────  │
      │  Returns: colors,      │  { settings }      │
      │  fonts, position, etc. │                     │
      │ ◄───────────────────  │                     │
```

**API implementation** (`widget.ts`):

```typescript
export const widgetRoute = new Hono().get("/settings/:appId", async (c) => {
  const settings = await getApplicationSettings(appId);
  return c.json(
    { settings },
    200,
    { "Cache-Control": "public, max-age=300" } // Cache for 5 min
  );
});
```

---

## 6. Init Options Override

Customers can override API settings directly in the init call:

```javascript
DeliveryChat.init({
  appId: "app_abc123",
  position: "bottom-left",  // Override position
  autoOpen: true,           // Auto-open on load
  colors: { primary: "#ff0000" },  // Override specific colors
});
```

**Merge logic** (`index.ts`):

```typescript
function mergeSettings(api, init) {
  const base = { ...defaultSettings, ...api };      // API settings
  const overrides = buildInitOverrides(base, init); // Init overrides
  return { ...base, ...overrides };                  // Init wins!
}
```

---

## 7. The Queue Pattern — Safe Async Loading

**Problem:** The customer might call `DeliveryChat.init()` before the script finishes loading (e.g. with `async` script tag).

**Solution:** A stub runs first and queues calls. When the full script loads, it processes the queue.

**Stub** (runs at top of `widget.js`, before imports):

```javascript
(function () {
  window.DeliveryChat = window.DeliveryChat || { queue: [] };
  window.DeliveryChat.init = function (opts) {
    window.DeliveryChat.queue.push(["init", opts]);
  };
})();
```

**Processing** (when full code loads):

```javascript
const queue = window.DeliveryChat?.queue;
if (Array.isArray(queue)) {
  for (const item of queue) {
    if (item[0] === "init") init(item[1]);
  }
}
```

---

## 8. Architecture Summary

```
┌─────────────────────────────────────────────────────────────────┐
│ Customer Website                                                  │
│   <script src="widget.js">  →  DeliveryChat.init({ appId })     │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ Widget.js (Bundle)                                               │
│   • Init Queue      • State (pub/sub)    • Components            │
│   • API Client      • Shadow DOM         • CSS Variables         │
└─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
            │ GET /v1/     │ │ Hono API     │ │ applications │
            │ widget/      │ │              │ │ .settings    │
            │ settings/:id │ │              │ │ (JSONB)      │
            └──────────────┘ └──────────────┘ └──────────────┘
```

---

## Why This Pattern Works

1. **Zero dependencies** — No React/Vue required on the customer site
2. **Style isolation** — Shadow DOM prevents CSS conflicts
3. **Easy theming** — CSS variables are clean and performant
4. **CDN-ready** — Static bundle can be cached globally
5. **Safe loading** — Queue pattern handles async script loading
