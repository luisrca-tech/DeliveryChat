# Integrator Guide — Embedding the DeliveryChat Widget Safely

**Audience:** Engineers integrating the DeliveryChat widget into a host site.
**Last updated:** 2026-04-23
**Related:** [security-roadmap.md](./security-roadmap.md), [threat-model.md](./threat-model.md)

This guide describes how to embed the widget so that supply-chain compromise of the widget bundle is detectable, and so the widget runs cleanly under a strict host-page Content Security Policy (CSP).

---

## 1. Embed snippet (with Subresource Integrity)

```html
<script
  src="https://your-cdn.com/widget.js"
  integrity="sha384-<emitted-hash>"
  crossorigin="anonymous"
></script>
<script>
  DeliveryChat.init({ appId: "your-app-uuid" });
</script>
```

- **`integrity`** — the `sha384` hash of the widget bundle. Sourced from `dist-embed/widget.iife.js.sri.json` (field `integrity`). Published by every CI build.
- **`crossorigin="anonymous"`** — required by the browser to perform the SRI check on a cross-origin script.

> **Always source the hash from the build artifact.** Hand-copied hashes drift and silently break embeds whenever the widget is updated. The release pipeline should template the snippet from the artifact.

### What SRI gives you

If the bundle at `https://your-cdn.com/widget.js` is altered in transit or at rest (CDN compromise, MITM, malicious patch by a third party), the browser computes a different hash, the integrity check fails, and the script is **not executed**. You get a console error instead of arbitrary attacker code running in your origin.

### Async / defer loading

`integrity` and `crossorigin` work identically with `async` and `defer`. The queue-stub pattern documented in [`packages/docs/embed/embed-widget.md`](../embed/embed-widget.md) is unchanged.

---

## 2. Recommended Content-Security-Policy

The widget is engineered to run under a strict CSP. The following directive set is the **minimum** that lets the widget operate; tighten further per your application's needs.

```http
Content-Security-Policy:
  default-src 'self';
  script-src  'self' https://your-cdn.com;
  style-src   'self';
  img-src     'self' data: https://your-api.example.com;
  connect-src 'self' https://your-api.example.com wss://your-api.example.com;
  frame-ancestors 'none';
  base-uri    'none';
```

Replace `https://your-cdn.com` with the host serving `widget.js` and `https://your-api.example.com` with the DeliveryChat API host.

### Why each directive is here

| Directive | Why |
|---|---|
| `script-src 'self' https://your-cdn.com` | Permits your own scripts and the widget bundle. SRI on the embed `<script>` covers tamper detection. |
| `style-src 'self'` | The widget injects its CSS via Constructable Stylesheets (`adoptedStyleSheets`), which **does not** require `'unsafe-inline'`. Do not weaken this directive on the widget's behalf. |
| `img-src ... https://your-api.example.com` | The widget loads brand assets (logo, icons) from the API host. |
| `connect-src ... https://your-api.example.com wss://your-api.example.com` | Settings fetch (HTTPS) and chat transport (WebSocket). |
| `frame-ancestors 'none'` | Defensive: prevents your page (and the embedded widget) from being framed. |

### What the widget does NOT need

- ❌ `script-src 'unsafe-inline'`
- ❌ `script-src 'unsafe-eval'`
- ❌ `style-src 'unsafe-inline'`
- ❌ A nonce relaxation for either `script-src` or `style-src`

If a future widget version forces any of those, treat it as a **regression** and file an issue against `feature/security-loader-integrity`.

---

## 3. Verifying the runtime audit

The widget runtime is audited per build to ensure it does not introduce CSP-relaxing patterns:

| Pattern | Status in widget runtime |
|---|---|
| `eval` / `new Function(...)` | Not used. |
| `<script>` injection into the host document | Not used. |
| Inline `<style>` injection into the host document | Not used. |
| Inline `<style>` injection into the Shadow Root | Replaced with Constructable Stylesheets (`adoptedStyleSheets`) in Phase 2. |
| Inline event handler attributes (`onclick="..."`) | Not used; events bound via `addEventListener`. |
| `style="..."` attributes parsed from HTML | Not used; programmatic `element.style.*` writes (not subject to `style-src`). |

A violation in any of these rows means the integrator CSP cannot be `'self'`-only and the regression must be repaired in the widget — not papered over by relaxing CSP.

---

## 4. Operational checklist

When publishing a new widget release:

1. Run `bun run build:embed` from `apps/widget`.
2. Read `dist-embed/widget.iife.js.sri.json`.
3. Update the published embed snippet's `integrity=` to the value of `integrity`.
4. Re-deploy `widget.js` and the snippet **together**. Skewed deployments (new bundle, old hash) break every integrator.
5. The build is deterministic: re-running `build:embed` on unchanged source produces the same hash. A surprise hash change indicates a real source change.
