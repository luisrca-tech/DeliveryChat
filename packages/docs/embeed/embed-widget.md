# Embed Widget

Vanilla JS chat widget with Shadow DOM, CSS variables, and public settings API.

## Embed

```html
<script src="https://your-cdn.com/widget.js"></script>
<script>
  DeliveryChat.init({
    appId: "550e8400-e29b-41d4-a716-446655440000",
    apiBaseUrl: "https://api.yourdomain.com",
    position: "bottom-right",
    autoOpen: false,
    autoOpenDelay: 5000,
  });
</script>
```

## Init Options

| Option        | Type                            | Required | Description                         |
| ------------- | ------------------------------- | -------- | ----------------------------------- |
| appId         | string                          | Yes      | Application UUID                    |
| apiBaseUrl    | string                          | No       | API base URL (default: same origin) |
| position      | "bottom-left" \| "bottom-right" | No       | Override API settings               |
| autoOpen      | boolean                         | No       | Override API settings               |
| autoOpenDelay | number                          | No       | Override API settings (ms)          |

## Async Load

If the script is loaded async, add a stub before it:

```html
<script>
  window.DeliveryChat = window.DeliveryChat || { queue: [] };
  window.DeliveryChat.init = function (opts) {
    (window.DeliveryChat.queue = window.DeliveryChat.queue || []).push([
      "init",
      opts,
    ]);
  };
</script>
<script src="https://your-cdn.com/widget.js" async></script>
<script>
  DeliveryChat.init({ appId: "x", apiBaseUrl: "https://api.example.com" });
</script>
```

## Destroy

```js
DeliveryChat.destroy();
```

## Build

```bash
bun run build:embed
```

Output: `dist-embed/widget.iife.js`
