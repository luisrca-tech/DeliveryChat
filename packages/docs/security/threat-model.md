# Threat Model — Widget

**Status:** Finalized (Phase 5 complete)
**Last updated:** 2026-04-23
**Related:** [security-roadmap.md](./security-roadmap.md)

---

## Scope

The DeliveryChat widget is a **Shadow DOM IIFE** loaded into the host page's JavaScript realm — not a cross-origin iframe. This document models threats across four trust boundaries, lists the control addressing each, and tracks residual risks we knowingly accept.

## Actors and assets

| Actor | Trust | Assets handled |
|---|---|---|
| Host page (integrator site) | Untrusted runtime — same realm as widget | May observe widget fetches and DOM |
| Widget code (our IIFE) | Trusted author, untrusted deployment context | Visitor ID, API key in transit, WS token, message payloads |
| Visitor (end user chatting) | Untrusted, unauthenticated | Own messages and visitor identity |
| Operator / Admin (tenant staff via admin app) | Trusted (authenticated) | All conversations within their organization |
| Backend API (`hono-api`) | Trusted | Origin allow-list, rate limits, tenant data, WS token signing secret |

## Directional threats

Four directions of attack are modeled independently. Each direction lists its threats and the controls that address them.

### 1. Host page → Widget

Malicious or compromised host page code attempts to exfiltrate widget state, impersonate the visitor, or tamper with widget behavior.

| Threat | Control | Phase |
|---|---|---|
| Host injects HTML via widget DOM attributes (reflected XSS through config) | **Rendering discipline** — `textContent` for all dynamic content; ESLint ban on dynamic `innerHTML` / `outerHTML` / `insertAdjacentHTML` | 1 ✅ |
| Host reads API key or WS token from `window.DeliveryChat` | **Surface lock** — `window.DeliveryChat` exposes only `init`, `destroy`, `queue`; no tokens, keys, or identifiers accessible | 4 ✅ |
| Host-served script is swapped for a malicious payload (supply-chain) | **SRI** — SHA-384 hash artifact emitted by build; embed snippet documents `integrity=` and `crossorigin="anonymous"` | 2 ✅ |
| Host CSP is looser than recommended | **Integrator guide** — [`integrator-guide.md`](./integrator-guide.md) publishes the recommended CSP | 2 ✅ |
| Host monkey-patches `fetch` / `WebSocket` to intercept widget traffic | **Accepted risk** — Shadow DOM IIFE shares the host's JS realm. Mitigated only by iframe migration (deferred) | — |

### 2. Widget → Host page

Defensive direction: widget must not introduce XSS sinks, inline handlers, or CSP-relaxing patterns into the host's DOM.

| Threat | Control | Phase |
|---|---|---|
| Widget renders hostile operator/admin message content as HTML | **Rendering discipline** — `textContent` only; static SVG icons are the sole sanctioned `innerHTML` writes | 1 ✅ |
| Widget requires `unsafe-inline` / `unsafe-eval` in host CSP | **CSP-clean runtime** — no inline scripts; Shadow-root styles via Constructable Stylesheets (`adoptedStyleSheets`) | 2 ✅ |
| Widget exposes mutable globals host can hijack | **Surface lock** — `window.DeliveryChat` frozen to `init` / `destroy` / `queue` | 4 ✅ |

### 3. Visitor → Operator / Admin

Visitor is anonymous and untrusted. Anything they type will eventually be rendered in the admin app for operators.

| Threat | Control | Phase |
|---|---|---|
| Visitor submits HTML/JS in message content; admin UI interprets it as markup | **Admin rendering discipline** — zero `dangerouslySetInnerHTML` in `apps/admin/src/`, enforced by ESLint | 1 ✅ |
| Visitor spams messages to burn a tenant's per-org rate budget | **Per-visitor rate limiter** — independent per-second/minute/hour windows keyed by `(appId, visitorId)`, composed with per-tenant limiter | 4 ✅ |
| Visitor replays / forges a WebSocket session from a different origin | **Signed WS token** — HMAC-SHA256 token bound to `(appId, origin, visitorId)` with short TTL; verified on WS upgrade with origin binding, signature check, and expiry enforcement | 5 ✅ |
| Visitor impersonates another visitor by guessing visitorId | **Token binding** — visitorId is embedded in the signed token; the server verifies the token signature, so a forged visitorId requires forging the HMAC | 5 ✅ |

### 4. Operator / Admin → Visitor

Operator content is author-trusted but not author-controlled for rendering purposes. Widget treats it as untrusted input when rendering.

| Threat | Control | Phase |
|---|---|---|
| Operator submits HTML/JS in a reply; widget interprets it as markup | **Rendering discipline** — widget `.message-text` rendered with `textContent` | 1 ✅ |
| Compromised admin account uses widget surface to pivot to host | **Defense in depth** — rendering discipline prevents XSS; per-visitor rate limiting prevents abuse; WS token binding prevents session forgery | 1+4+5 ✅ |

## Residual risks accepted

1. **Shadow DOM is not a security boundary.** The host's JavaScript realm can read widget closures, monkey-patch `fetch` / `WebSocket`, and observe in-flight requests. This is the Shadow DOM IIFE architectural tradeoff; iframe migration is deferred until authenticated visitors, payment flows, or stored visitor secrets enter the widget.

2. **Origin allow-list is a per-tenant configuration choice.** A wildcard entry (e.g. `*.example.com`) means one compromised subdomain under the wildcard makes the entire wildcard usable. This is documented in the admin UI and integrator guide as an explicit tenant risk choice. Tenants should prefer exact-domain entries where possible.

3. **Rate-limit store is in-memory.** Not shared across API instances. Acceptable for the current single-instance deployment; revisited if horizontal scale requires it.

4. **WS token secret is shared across all tenants.** A single `WS_TOKEN_SECRET` signs all visitor tokens. If compromised, an attacker could forge tokens for any application. Mitigation: secret is stored in Infisical, rotated periodically, never logged or hardcoded.

5. **Visitor identity is localStorage-based.** `visitorId` is a random UUID stored in `localStorage`. Clearing storage creates a new identity. This is acceptable for anonymous support chat — no sensitive data is tied to visitor identity.

## Control status

| Control | Phase | Status |
|---|---|---|
| Rendering discipline + lint (widget) | 1 | ✅ |
| Rendering discipline + lint (admin) | 1 | ✅ |
| SRI + CSP guidance | 2 | ✅ |
| Origin allow-list (server) | 3a | ✅ |
| Origin allow-list (admin UI) | 3b | ✅ |
| Per-visitor rate limit | 4 | ✅ |
| `window.DeliveryChat` surface lock | 4 | ✅ |
| Signed WS token | 5 | ✅ |
| Finalized threat model | 5 | ✅ |
