# @deliverychat/sdk

Embeddable chat widget and headless SDK for DeliveryChat — add live customer support to any website with a single script tag or npm import.

## Install

```bash
npm install @deliverychat/sdk
```

<details>
<summary>yarn / pnpm / bun</summary>

```bash
yarn add @deliverychat/sdk
pnpm add @deliverychat/sdk
bun add @deliverychat/sdk
```

</details>

## CDN Quickstart

Drop the script tag into your HTML and initialize with your app ID:

```html
<script>
  window.DeliveryChat = window.DeliveryChat || { queue: [] };
  DeliveryChat.queue.push(["init", { appId: "YOUR_APP_ID" }]);
</script>
<script async src="https://widget.yourdomain.com/widget.js"></script>
```

The widget loads asynchronously — any calls made before the script finishes loading are queued and replayed automatically. You can safely register event listeners or call methods before the script is ready:

```html
<script>
  window.DeliveryChat = window.DeliveryChat || { queue: [] };

  DeliveryChat.queue.push([
    "on",
    "ready",
    function () {
      console.log("Chat widget connected!");
    },
  ]);

  DeliveryChat.queue.push(["init", { appId: "YOUR_APP_ID" }]);
</script>
<script async src="https://widget.yourdomain.com/widget.js"></script>
```

## npm Module Quickstart

```javascript
import { init, destroy, getSdkApi } from "@deliverychat/sdk";

// Initialize the widget
init({ appId: "YOUR_APP_ID" });

const sdk = getSdkApi();

// Listen to events
sdk.on("ready", () => {
  console.log("Chat widget connected!");
});

sdk.on("message:received", (message) => {
  console.log("New message:", message.content);
});

// Clean up when done (e.g. on SPA route change)
destroy();
```

## Command Queue

The command queue pattern lets you interact with the SDK before the script has loaded. This is the same pattern used by analytics tools like Segment and Intercom.

```html
<script>
  // 1. Create the global with an empty queue
  window.DeliveryChat = window.DeliveryChat || { queue: [] };

  // 2. Push commands — they are stored until the script loads
  DeliveryChat.queue.push(["on", "unread:changed", function (e) {
    document.title = e.count > 0 ? "(" + e.count + ") My Site" : "My Site";
  }]);

  DeliveryChat.queue.push(["sendMessage", "Hi, I need help with my order"]);

  DeliveryChat.queue.push(["identify", {
    externalId: "user-123",
    email: "jane@example.com",
    name: "Jane Doe"
  }]);

  DeliveryChat.queue.push(["init", { appId: "YOUR_APP_ID" }]);

  // 3. Load the script — queued commands replay in order
</script>
<script async src="https://widget.yourdomain.com/widget.js"></script>
```

Supported queue commands: `init`, `on`, `sendMessage`, `identify`.

## Headless Mode

Initialize without any UI to build your own chat interface or integrate server-side:

```javascript
import { init, getSdkApi } from "@deliverychat/sdk";

init({ appId: "YOUR_APP_ID", headless: true });

const sdk = getSdkApi();

// Send a message (returns a promise)
const msg = await sdk.sendMessage("Hello, I need help");
console.log("Server acknowledged:", msg.id);

// Get current conversation state
const conv = sdk.getConversation();
// { id: "conv-123", status: "active", messages: [...] }

// Listen to incoming messages
sdk.on("message:received", (msg) => {
  console.log("Operator replied:", msg.content);
});
```

In headless mode the WebSocket connects immediately on `init()`. UI methods (`open`, `close`, `toggle`, `hideWidget`, `showWidget`) become no-ops, and the `open`/`close` events are suppressed. All other events and methods work normally.

## Events

Register listeners with `on(event, callback)` and remove them with `off(event, callback)`. Listeners registered before `init()` are preserved and start firing once the SDK connects.

| Event                   | Payload                        | Description                                                      |
| ----------------------- | ------------------------------ | ---------------------------------------------------------------- |
| `ready`                 | `void`                         | WebSocket connection established                                 |
| `open`                  | `void`                         | Chat panel opened (widget mode only)                             |
| `close`                 | `void`                         | Chat panel closed (widget mode only)                             |
| `message:received`      | `ChatMessage`                  | A new message from an operator or admin arrived                  |
| `message:sent`          | `ChatMessage`                  | A visitor message was acknowledged by the server                 |
| `conversation:started`  | `{ conversationId: string }`   | A new conversation was created                                   |
| `conversation:resolved` | `{ conversationId: string }`   | The conversation was marked as resolved                          |
| `unread:changed`        | `{ count: number }`            | The unread message count changed                                 |

**`ChatMessage` payload shape:**

```typescript
{
  id: string;
  content: string;
  type: "text" | "system";
  senderRole: "visitor" | "operator" | "admin";
  senderId: string;
  status: "pending" | "sent" | "failed";
  createdAt: string;
  editedAt?: string | null;
  isDeleted?: boolean;
}
```

## Identify

Associate the current visitor with a known user in your system:

```javascript
await DeliveryChat.identify({
  externalId: "user-123",
  email: "jane@example.com",
  name: "Jane Doe",
  metadata: { plan: "premium", seats: 5 },
});
```

At least one of `externalId`, `email`, `name`, or `metadata` must be provided.

### HMAC Verification

If your account has identity verification enabled, compute an HMAC server-side and pass it alongside the `externalId`:

```javascript
// ---- Server (Node.js) ----
import crypto from "node:crypto";

const hmac = crypto
  .createHmac("sha256", process.env.DELIVERYCHAT_IDENTITY_SECRET)
  .update("user-123")
  .digest("hex");
// Send `hmac` to the client

// ---- Client ----
await DeliveryChat.identify({
  externalId: "user-123",
  hmac: hmacFromServer,
  name: "Jane Doe",
});
```

## API Reference

| Method | Signature | Description |
| --- | --- | --- |
| `init` | `(opts: InitOptions) => void` | Initialize the SDK with your app ID and optional settings |
| `destroy` | `() => void` | Tear down the SDK, disconnect WebSocket, remove UI |
| `open` | `() => void` | Open the chat panel |
| `close` | `() => void` | Close the chat panel |
| `toggle` | `() => void` | Toggle the chat panel open/closed |
| `hideWidget` | `() => void` | Hide the launcher button |
| `showWidget` | `() => void` | Show the launcher button |
| `sendMessage` | `(text: string) => Promise<ChatMessage>` | Send a message and wait for server acknowledgment |
| `identify` | `(params: IdentifyParams) => Promise<IdentityResult>` | Associate the visitor with a known user identity |
| `getConversation` | `() => ConversationSnapshot \| null` | Get the current conversation state, or `null` if none |
| `on` | `(event, callback) => void` | Subscribe to an SDK event |
| `off` | `(event, callback) => void` | Unsubscribe from an SDK event |

**`InitOptions`:**

```typescript
{
  appId: string;
  apiBaseUrl?: string;
  position?: "bottom-left" | "bottom-right";
  autoOpen?: boolean;
  autoOpenDelay?: number;
  colors?: { primary?: string; background?: string; text?: string; /* ... */ };
  launcherLogoUrl?: string | null;
  headless?: boolean;
}
```

## Browser Support

The SDK supports the **latest 2 major versions** of:

- Chrome
- Firefox
- Safari
- Edge
