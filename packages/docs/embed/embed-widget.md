# Embed Widget

Vanilla JS chat widget with Shadow DOM, CSS variables, and public settings API.

## Embed

```html
<script
  src="https://your-cdn.com/widget.js"
  integrity="sha384-<emitted-hash>"
  crossorigin="anonymous"
></script>
<script>
  DeliveryChat.init({
    appId: "550e8400-e29b-41d4-a716-446655440000",
    position: "bottom-right",
    autoOpen: false,
    autoOpenDelay: 5000,
  });
</script>
```

> The `integrity` value is published in `dist-embed/widget.iife.js.sri.json` after each build. Always source it from the artifact, never hand-copy it. See `packages/docs/security/integrator-guide.md` for the recommended host-page CSP.

## Init Options

| Option        | Type                            | Required | Description           |
| ------------- | ------------------------------- | -------- | --------------------- |
| appId         | string                          | Yes      | Application UUID      |
| position      | "bottom-left" \| "bottom-right" | No       | Override API settings |
| autoOpen      | boolean                         | No       | Override API settings |
| autoOpenDelay | number                          | No       | Override API settings (ms) |

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
  DeliveryChat.init({ appId: "x" });
</script>
```

## Destroy

```js
DeliveryChat.destroy();
```

## Build

Set `VITE_API_BASE_URL` in `.env` before building (see `apps/widget/.env.example`).

```bash
bun run build:embed
```

Output:
- `dist-embed/widget.iife.js` — the bundle
- `dist-embed/widget.iife.js.sri.json` — `{ file, algorithm, integrity, bytes }` artifact consumed by docs and release automation when publishing the embed snippet
