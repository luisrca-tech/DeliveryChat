# Threat Model — Widget

**Status:** Skeleton (Phase 1). Expanded across the five hardening slices.
**Last updated:** 2026-04-22
**Related:** [security-roadmap.md](./security-roadmap.md)

---

## Scope

The DeliveryChat widget is a **Shadow DOM IIFE** loaded into the host page's JavaScript realm. It is not a cross-origin iframe. This document models threats across four trust boundaries, lists the control addressing each, and tracks residual risks we knowingly accept.

## Actors and assets

| Actor | Trust | Assets handled |
|---|---|---|
| Host page (integrator site) | Untrusted runtime — same realm as widget | May observe widget fetches and DOM |
| Widget code (our IIFE) | Trusted author, untrusted deployment context | Visitor ID, API key in transit, WS token, message payloads |
| Visitor (end user chatting) | Untrusted, unauthenticated | Own messages and visitor identity |
| Operator / Admin (tenant staff via admin app) | Trusted (authenticated) | All conversations within their organization |
| Backend API (`hono-api`) | Trusted | Origin allow-list, rate limits, tenant data |

## Directional threats

Four directions of attack must be modeled independently. Each direction lists its threats and the controls that address them. Slice numbers map to phases in the [security roadmap](./security-roadmap.md).

### 1. Host page → Widget

Malicious or compromised host page code attempts to exfiltrate widget state, impersonate the visitor, or tamper with widget behavior.

| Threat | Phase 1 control | Later slice |
|---|---|---|
| Host injects HTML via widget DOM attributes (reflected XSS through config) | **Rendering discipline** — `textContent` for all dynamic content; ESLint ban on dynamic `innerHTML` / `outerHTML` / `insertAdjacentHTML` | — |
| Host reads API key or WS token from widget memory / `window.DeliveryChat` | Public surface audit (planned) | Phase 4 — `window.DeliveryChat` exposes only `init`, `destroy`, `queue`; no tokens, keys, or identifiers |
| Host-served script is swapped for a malicious payload (supply-chain) | — | ✅ Phase 2 — SHA-384 SRI artifact emitted by build (`widget.iife.js.sri.json`); embed snippet documents `integrity=` and `crossorigin="anonymous"` |
| Host CSP is looser than recommended | Published integrator guide (planned) | ✅ Phase 2 — [`integrator-guide.md`](./integrator-guide.md) publishes the recommended CSP (`style-src 'self'` is sufficient — widget uses `adoptedStyleSheets`) |

### 2. Widget → Host page

Defensive direction: widget must not introduce XSS sinks, inline handlers, or CSP-relaxing patterns into the host's DOM.

| Threat | Phase 1 control | Later slice |
|---|---|---|
| Widget renders hostile operator/admin message content as HTML, escaping Shadow DOM into host context | **Rendering discipline** — `textContent` only; static SVG icons are the sole sanctioned `innerHTML` writes, each marked with an inline lint justification | — |
| Widget requires `unsafe-inline` / `unsafe-eval` in host CSP | — | ✅ Phase 2 — no inline scripts; Shadow-root styles injected via Constructable Stylesheets (`adoptedStyleSheets`); audit checklist in [`apps/widget/src/widget/docs/loader-integrity.md`](../../apps/widget/src/widget/docs/loader-integrity.md) |
| Widget exposes mutable globals host can hijack | Partial via public surface audit | Phase 4 — `window.DeliveryChat` surface locked to `init` / `destroy` / `queue` |

### 3. Visitor → Operator / Admin

Visitor is anonymous and untrusted. Anything they type will eventually be rendered in the admin app for operators.

| Threat | Phase 1 control | Later slice |
|---|---|---|
| Visitor submits HTML/JS in message content; operator admin UI interprets it as markup | **Admin rendering discipline** — zero `dangerouslySetInnerHTML` in `apps/admin/src/`, enforced by ESLint; JSX children rendered as text | — |
| Visitor spams messages to burn a tenant's per-org rate budget | Shared with per-tenant limiter | Phase 4 — per-visitor rate-limit middleware composed with tenant limiter |
| Visitor replays / forges a WebSocket session from a different origin | — | Phase 5 — signed short-lived WS token bound to `(appId, origin, visitorId)` |

### 4. Operator / Admin → Visitor

Operator content is author-trusted but not author-controlled for rendering purposes. Widget treats it as untrusted input when rendering.

| Threat | Phase 1 control | Later slice |
|---|---|---|
| Operator submits HTML/JS in a reply; widget interprets it as markup inside the visitor's browser | **Rendering discipline** — widget `.message-text` rendered with `textContent`; hostile payload tests cover this path | — |
| Compromised admin account uses widget surface to pivot to host | Partial via rendering discipline | Phase 4 — rate limiting prevents abuse; Phase 5 — WS token binds sender |

## Residual risks accepted in Phase 1

- **Shadow DOM is not a security boundary.** The host's JavaScript realm can read widget closures, monkey-patch `fetch` / `WebSocket`, and observe in-flight requests. This is the Shadow DOM IIFE architectural tradeoff; iframe migration is deferred until authenticated visitors, payment flows, or stored visitor secrets enter the widget (see roadmap).
- **Origin allow-list is a per-tenant configuration choice.** A wildcard entry (e.g. `*.example.com`) means one compromised subdomain makes the whole wildcard usable. Documented as an explicit tenant risk choice in Phase 3.
- **Rate-limit store is in-memory.** Not shared across API instances. Acceptable for the current deployment scale; revisited only if horizontal scale requires it.

## Control status

| Control | Slice | Status |
|---|---|---|
| Rendering discipline + lint (widget) | Phase 1 | ✅ this slice |
| Rendering discipline + lint (admin) | Phase 1 | ✅ this slice |
| Threat model skeleton | Phase 1 | ✅ this slice |
| SRI + CSP guidance | Phase 2 | ✅ |
| Origin allow-list (server) | Phase 3a | ⬜ pending |
| Origin allow-list (admin UI) | Phase 3b | ⬜ pending |
| Per-visitor rate limit | Phase 4 | ⬜ pending |
| `window.DeliveryChat` surface lock | Phase 4 | ⬜ pending |
| Signed WS token | Phase 5 | ⬜ pending |
| Finalized threat model | Phase 5 | ⬜ pending |
