# Threat Model — Widget

**Status:** Finalized (Phase 5 complete)
**Last updated:** 2026-04-24
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
| Visitor opens excessive concurrent WS connections to exhaust server resources | **Connection cap** — `InMemoryRoomManager` enforces max 5 concurrent connections per user; excess connections closed with `4009 connection_limit`. **WS upgrade rate limit** — IP-based rate limiter (5/s, 30/min, 200/hr) on `/v1/ws` prevents upgrade spam | 6 ✅ |
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

6. **Empty-origin WS token replay.** When no `Origin` header is present (e.g. non-browser clients, some proxy configurations), `POST /widget/ws-token` signs a token with `origin: ""`. On WS upgrade, `wsAuth.ts` also falls back to `""`, so the origin binding passes. A token signed without an origin can be replayed from any context where `Origin` is absent. Mitigated by: (a) the 120-second TTL limits the replay window, (b) the token is also bound to `appId` and `visitorId`, (c) the widget auth middleware still enforces app existence and allowed-origins on the initial HTTP request. Future hardening: reject empty-origin token requests for live-key contexts once `widgetAuth` gains key-environment awareness.

7. **WS token in query string.** WebSocket connections pass the token as `?token=...` in the URL because the browser `WebSocket` API does not support custom headers on upgrade requests. This means the token appears in access logs, reverse-proxy logs, and potentially browser history. Mitigated by: (a) 120-second TTL — tokens are short-lived and non-renewable, (b) tokens are single-purpose (valid only for WS upgrade, not API calls), (c) tokens are HMAC-signed and bound to a specific `(appId, origin, visitorId)` tuple. This is a standard WebSocket limitation shared by most real-time platforms.

8. **Same-origin WS token replay within TTL window.** A valid WS token can be reused unlimited times within its 120-second TTL from the same origin. Cross-origin replay is prevented by the origin binding. Same-origin replay from a compromised host page is unprotected but impractical to exploit: (a) the 120s TTL limits the attack window, (b) origin binding prevents cross-origin use, (c) appId binding scopes the token to a single application, (d) the connection cap (max 5 per user) limits resource impact. If replay protection is needed later, add a nonce/jti field with an in-memory set of consumed token IDs cleaned on TTL expiry.

9. **`/widget/settings/:appId` has no origin check.** This public endpoint returns non-sensitive display settings (colors, position, greeting text) for a given application ID without auth or origin validation. This allows enumeration of active app IDs, but the returned data is designed for public display and contains no secrets, billing info, or internal identifiers. The risk is accepted because: (a) settings are non-sensitive display config, (b) adding auth would break the widget initialization flow where settings are fetched before any auth context exists, (c) the appId is a UUID, making brute-force enumeration impractical.

10. **WS connections outlive token TTL.** Token is validated only during `onOpen`. Once connected, the session persists. Mitigated by: (a) maximum connection lifetime of 8 hours enforced by `InMemoryRoomManager` — expired connections are closed with code `4008 session_expired`, prompting the widget to reconnect with a fresh token, (b) the `disconnectUser()` method clears all rooms for the expired user.

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
| WS connection cap + upgrade rate limit | 6 | ✅ |
| WS connection lifetime (8h max) | 6 | ✅ |
| Finalized threat model | 5 | ✅ |
