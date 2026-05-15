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
