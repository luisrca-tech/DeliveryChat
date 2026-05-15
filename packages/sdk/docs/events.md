# SDK Event System

## Overview

The SDK exposes a typed event system that lets host pages react to widget lifecycle changes. Events are registered via `DeliveryChat.on(event, callback)` and removed via `DeliveryChat.off(event, callback)`.

Listeners registered **before** `init()` are preserved — the emitter accepts subscriptions immediately, and events start firing once the EventBridge connects during initialization.

## Events

| Event | Payload | Fires when |
|---|---|---|
| `ready` | `void` | WebSocket connection reaches `connected` state |
| `open` | `void` | Chat panel opens (via `open()`, `toggle()`, or user click) |
| `close` | `void` | Chat panel closes (via `close()`, `toggle()`, or user click) |
| `message:received` | `ChatMessage` | A non-visitor message with status `sent` appears |
| `message:sent` | `ChatMessage` | A pending visitor message is acknowledged by the server (ID changes from client UUID to server UUID) |
| `conversation:started` | `{ conversationId: string }` | `conversationId` transitions from `null` to a value |
| `conversation:resolved` | `{ conversationId: string }` | `conversationStatus` transitions to `closed` |
| `unread:changed` | `{ count: number }` | `unreadCount` state changes |

## Architecture

```
State (subscribe)  ──►  EventBridge  ──►  EventEmitter  ──►  Host page listeners
                         (maps state         (typed,           (registered via
                          changes to          generic)          on/off)
                          SDK events)
```

### Components

- **`EventEmitter<SdkEventMap>`** — Generic typed emitter. Supports `on`, `off`, `emit`, `removeAllListeners`. Errors in one listener do not break others.
- **`SdkEventMap`** — Type definition mapping event names to payload types. Provides compile-time safety for `on`/`off`/`emit`.
- **`EventBridge`** — Subscribes to internal `state.ts` keys and translates state transitions into semantic SDK events. Handles the message ACK pattern (pending → sent with ID change).
- **`SdkApi`** — Singleton that owns the emitter instance. Control methods (`open`, `close`, `toggle`, `hideWidget`, `showWidget`) mutate state, which the bridge translates to events.

### Message ACK Detection

When a visitor sends a message, it starts as `pending` with a client-generated UUID. On server acknowledgment, the message array updates with a new server-assigned ID and `status: "sent"`. The bridge detects this by tracking pending visitor message IDs in a `Set`. When a new `sent` visitor message appears and there were previously pending messages, it fires `message:sent`.

## Usage Example

```html
<script>
  window.DeliveryChat = window.DeliveryChat || { queue: [] };
  DeliveryChat.queue.push(["on", "ready", function() {
    console.log("Widget connected!");
  }]);
  DeliveryChat.queue.push(["init", { appId: "app_xxx" }]);
</script>
<script async src="https://cdn.example.com/widget.iife.js"></script>
```

```javascript
// After init
DeliveryChat.on("message:received", (msg) => {
  console.log("New message:", msg.content);
});

DeliveryChat.on("unread:changed", ({ count }) => {
  document.title = count > 0 ? `(${count}) My Site` : "My Site";
});
```

## Lifecycle

1. Host page creates `window.DeliveryChat = { queue: [] }` and pushes `["on", ...]` commands
2. IIFE loads, replays queued `on` commands against the emitter (listeners attached before bridge)
3. `init()` boots the widget, calls `connectEventBridge(emitter)` — events start flowing
4. `destroy()` calls `disconnectEventBridge()` + `markDestroyed()` — all listeners removed, events stop
