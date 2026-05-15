# Headless Mode

## Overview

Headless mode allows the SDK to run without any UI rendering. It initializes the WebSocket connection, visitor session, and conversation lifecycle while skipping Shadow DOM creation, CSS injection, and all DOM rendering. This enables server-side integrations, custom UI implementations, and programmatic chat workflows.

## Usage

```javascript
DeliveryChat.init({ appId: "your-app-id", headless: true });

// Send a message (returns a promise that resolves on server ACK)
const msg = await DeliveryChat.sendMessage("Hello, I need help");

// Get current conversation state
const conv = DeliveryChat.getConversation();
// { id: "conv-123", status: "active", messages: [...] }

// Listen to events
DeliveryChat.on("message:received", (msg) => {
  console.log("Operator replied:", msg.content);
});
```

## Behavior Differences

| Feature | Normal Mode | Headless Mode |
|---|---|---|
| Shadow DOM / UI rendering | Yes | No |
| WebSocket connection | Lazy (on chat open) | Eager (on init) |
| `open()` / `close()` / `toggle()` | Sets UI state | No-op |
| `hideWidget()` / `showWidget()` | Sets visibility | No-op |
| `sendMessage()` | Available | Available |
| `getConversation()` | Available | Available |
| `open` / `close` events | Emitted | Suppressed |
| `ready` / `message:*` / `conversation:*` events | Emitted | Emitted |

## Architecture

### Init Path (`widget.ts`)

When `headless: true` is passed to `init()`:
1. Settings are fetched and merged (same as normal mode)
2. Chat controller is initialized (visitor ID, conversation restoration)
3. Event bridge is connected
4. `connectEagerly()` opens the WebSocket immediately
5. SDK is marked initialized with `{ headless: true }`
6. Shadow DOM creation, style injection, and rendering are **skipped**

### Promise-based sendMessage

`sendMessage(text)` returns a `Promise<ChatMessage>` that:
- Resolves when the server sends a `message:ack` WebSocket event
- Rejects on rate limiting, conversation errors, or a 15-second timeout
- Uses the `PendingMessages` module to track promises by `clientMessageId`, avoiding circular dependencies between `chat-controller.ts` and `ws.ts`

### Event Suppression

The `EventBridge` checks `getSdkApi().isHeadless()` before emitting `open`/`close` events. All other events (ready, message:received, message:sent, conversation:started, conversation:resolved, unread:changed) fire normally in headless mode.

## Command Queue

Pre-init `sendMessage` calls are supported via the command queue pattern:

```javascript
window.DeliveryChat = { queue: [] };
window.DeliveryChat.queue.push(["sendMessage", "Hello"]);
// After script loads, queued calls are replayed
```
