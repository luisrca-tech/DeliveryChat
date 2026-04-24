# Plan: Widget Security Hardening — Execution

> Source PRD: `docs/superpowers/plans/prd-widget-security-hardening.md` (2026-04-21)
> Predecessor plan: `docs/superpowers/plans/widget-security-hardening.md` (2026-04-18)

## Architectural decisions

Durable decisions that apply across all phases:

- **Architecture retained.** Shadow DOM IIFE. Iframe/postMessage migration (Option B) and hybrid Shadow DOM + sandboxed iframe (Option C) are rejected for Phase 1. Re-evaluated only if authenticated visitors, payments, or sensitive data enter the widget.
- **Origin allow-list schema.** New column `applications.allowedOrigins text[] not null default '{}'`. Existing single `applications.domain` is seeded into `allowedOrigins` on migration for every tenant.
- **Origin matching semantics.** Preserved from today's `validateOrigin()`: exact string match, case-insensitive; leading `*.` wildcard matches the apex domain plus any subdomain; implicit `www` equivalence. Applies to both `dk_live_*` and `dk_test_*` keys.
- **Test-mode leniency.** `dk_test_*` keys additionally allow implicit `http(s)://localhost`, `http(s)://localhost:*`, and `*.localhost`.
- **Wildcard migration guard.** Existing wildcard entries in `applications.domain` must be surfaced for operator confirmation before they are seeded into `allowedOrigins`. Silent carry-forward is not permitted.
- **Enforcement point.** Origin check lives in `widgetAuth` and `apiKeyAuth` middleware and is applied on every widget API call — not only on CORS preflight.
- **WebSocket token.** Signed short-lived token bound to the tuple `(appId, origin, visitorId)` with an explicit short TTL. Issued by a server endpoint, validated on WS upgrade, unforgeable and unreplayable. Query-param-only visitor auth is replaced.
- **`window.DeliveryChat` surface.** Exactly `init`, `destroy`, and `queue`. No tokens, API keys, visitor identifiers, or internal state are exposed to host-page JavaScript.
- **Rate limiting.** Per-visitor window added and composed with the existing per-tenant limiter. In-memory store, same pattern as `createTenantRateLimitMiddleware`. Redis is out of scope.
- **Rendering discipline.** `textContent` only for dynamic content in widget and admin. ESLint rule bans dynamic `innerHTML`, `insertAdjacentHTML`, and `outerHTML`; static string literals used for icon SVGs remain compliant.
- **Documentation layout.** New top-level folder `packages/docs/security/` holds `security-roadmap.md`, `threat-model.md`, `origin-enforcement.md`, and `integrator-guide.md`. Per-slice feature documentation is created under the relevant `apps/*/src/features/*/docs/`.
- **Delivery shape.** Six slices. One feature branch and one PR per slice, each executed through the full XP cycle (Planning → Design → Tests → Coding → Listening).
- **Database workflow.** The user runs `db:generate` and `db:migrate` manually. The plan never runs them autonomously.
 
---

## Phase 1: Content safety (`feature/security-content-safety`) — ✅ Complete (2026-04-23)

**User stories:** 2, 5, 6, 7, 21, 22, 25, 30

### What to build

Rendering discipline in both widget and admin, enforced by lint, so hostile content in either direction is rendered as text rather than interpreted as markup. Audit every `innerHTML` / `insertAdjacentHTML` / `outerHTML` write in `apps/widget/src/widget/` and confirm it assigns only a static string literal (the icon SVGs in `Launcher`, `Header`, and `MessageList`); convert any remaining dynamic-content renders to `textContent` or element construction. Confirm `apps/admin/src/` still has zero `dangerouslySetInnerHTML` uses. Introduce ESLint rules — one in `apps/widget` banning dynamic values on the three HTML sinks, one in `apps/admin` banning `dangerouslySetInnerHTML` — scoped so the existing static SVG constants remain compliant without refactor. Stand up the threat-model skeleton covering the four directional threats.

### Acceptance criteria

- [x] Every dynamic content render in the widget uses `textContent`; only static-SVG icon assignments remain as `innerHTML` writes
- [x] `apps/admin/src/` contains zero uses of `dangerouslySetInnerHTML` (verified by grep in CI)
- [x] ESLint rule in `apps/widget` fires on dynamic values passed to `innerHTML` / `insertAdjacentHTML` / `outerHTML` and passes on the existing static SVG constants
- [x] ESLint rule in `apps/admin` fires on any reintroduction of `dangerouslySetInnerHTML`
- [x] Unit tests render hostile payloads (script tags, event handlers, nested HTML) through the widget message list and the admin message display and assert escaped text
- [x] `packages/docs/security/threat-model.md` exists with the four directional threats and a placeholder for controls that later slices will add
- [x] Relevant `apps/*/src/features/*/docs/` are updated

---

## Phase 2: Loader integrity (`feature/security-loader-integrity`) — ✅ Complete (2026-04-23)

**User stories:** 1, 16, 17, 20, 31

### What to build

Deterministic SRI hash emission from the widget build plus published integrator guidance. Extend `apps/widget/vite.embed.config.ts` (or a post-build step) to emit the widget bundle together with a stable `sha384` SRI hash artifact that documentation and release automation can both consume. Update the documented embed snippet everywhere it appears to include `integrity="sha384-..."` and `crossorigin="anonymous"`. Publish a recommended `Content-Security-Policy` for integrators in `packages/docs/security/integrator-guide.md` aligned to what the widget actually needs. Audit widget runtime for any pattern that would force a host CSP to relax (inline script, inline style, `unsafe-eval`).

### Acceptance criteria

- [x] Widget build emits `widget.iife.js` plus a deterministic SRI hash artifact readable by docs and release scripts
- [x] Successive clean builds of unchanged source produce an identical hash (stability test)
- [x] Documented embed snippet includes `integrity=` and `crossorigin="anonymous"`, sourced from the emitted artifact
- [x] `packages/docs/security/integrator-guide.md` publishes the recommended CSP and the SRI-enabled embed snippet
- [x] Widget runtime injects no inline scripts or inline styles that would require `unsafe-inline` in a strict host CSP
- [x] Relevant feature docs updated

---

## Phase 3a: Origin allow-list — server (`feature/security-origin-allowlist-server`) — ✅ Complete (2026-04-23)

**User stories:** 10, 11, 13, 19, 23, 26, 27, 30, 32

### What to build

Server-side foundation for per-application origin allow-lists. Add `applications.allowedOrigins text[]` column, generate the Drizzle migration, and seed each application's current `domain` into the array on first run. Where an existing `domain` is a wildcard, the migration surfaces it and refuses to apply until an operator acknowledges it, so no customer silently loses or gains access. Extract origin matching into a pure helper reproducing current `validateOrigin()` semantics (exact match; leading `*.` matches apex + subdomains; implicit `www`; case-insensitive), with test-mode leniency for localhost. Wire the helper into `widgetAuth` and `apiKeyAuth` so every widget API call is checked — not only CORS preflight. Live-mode keys enforce allow-list membership; test-mode keys additionally allow the localhost set. Return predictable 403s whose body distinguishes origin rejection from other auth failures.

### Acceptance criteria

- [x] `applications` schema adds `allowedOrigins text[] not null default '{}'`; Drizzle migration generated (not auto-applied) — user runs `bun run db:generate --filter=hono-api` on review
- [x] Migration logic seeds each existing `domain` into `allowedOrigins`; wildcard entries require explicit operator confirmation before seeding — `bun run backfill:allowed-origins --filter=hono-api` with `--confirm-wildcards`
- [x] Pure origin-matcher helper implemented, with unit tests covering: exact match, leading-`*.` wildcard (apex + subdomain), implicit `www`, case-insensitivity, localhost leniency in test mode only, rejection of disallowed origin
- [x] `widgetAuth` and `apiKeyAuth` both call the helper on every request; bypass via CORS preflight is not possible
- [x] Integration tests cover: allowed exact origin (live + test), allowed wildcard origin (live + test), localhost allowed on test / rejected on live, disallowed origin rejected on both key types
- [x] 403 response body distinguishes `origin_not_allowed` from other auth errors
- [x] `packages/docs/security/origin-enforcement.md` published
- [x] Feature docs updated

---

## Phase 3b: Origin allow-list — admin UI (`feature/security-origin-allowlist-admin`) — ✅ Complete (2026-04-23)

**User stories:** 8, 9, 12, 14, 15, 28, 30

### What to build

Admin-facing management of the allow-list on top of the Phase 3a server primitive. Extend the application settings feature in `apps/admin` with a dedicated "Allowed Domains" section per application: list, add, and remove actions, with client-side validation using an extended `DOMAIN_REGEX` that also accepts wildcard entries. Inline validation feedback for malformed input so admins never save a silently-broken allow-list. Surface origin-rejection errors distinctly in the widget embed diagnostic path so integrators can tell "origin not in allow-list" apart from other failures. End-to-end test exercises the full loop: admin adds an origin, widget loads from that origin, admin removes it, widget is rejected.

### Acceptance criteria

- [x] Admin application settings page includes an "Allowed Domains" section with list / add / remove actions
- [x] Client-side validation rejects malformed entries with inline feedback; accepts wildcard entries matching the server regex
- [x] Admin UI clearly distinguishes origin-blocked errors from other widget errors in any surfaced diagnostics
- [x] E2E test adds an origin via admin UI, verifies widget loads from that origin, removes it, verifies widget is rejected — driven against a live server and real DB
- [x] Feature docs under `apps/admin/src/features/applications/docs/` updated to describe the allow-list UI and validation rules

---

## Phase 4: Abuse protection & surface minimization (`feature/security-abuse-protection`)

**User stories:** 4, 18, 30

### What to build

Per-visitor rate-limit middleware composed with the existing per-tenant limiter, plus a public-surface audit of `window.DeliveryChat`. Reuse the in-memory store pattern from `createTenantRateLimitMiddleware` (no Redis). Key by `(appId, visitorId)` with per-second, per-minute, and per-hour windows so a single abuser cannot drain a tenant's budget. Compose — do not replace — the tenant limiter. Audit the widget IIFE entry point to confirm `window.DeliveryChat` exposes exactly `init`, `destroy`, and `queue`; no tokens, keys, visitor identifiers, or internal state.

### Acceptance criteria

- [x] Per-visitor rate-limit middleware exists with per-second, per-minute, and per-hour windows; in-memory store; keyed by `(appId, visitorId)`
- [x] Middleware is composed with the per-tenant limiter on widget endpoints (both apply; neither replaces the other)
- [x] 429 responses include `Retry-After` and distinguish per-visitor vs per-tenant cause in the body
- [x] Integration tests cover: per-visitor limit fires before per-tenant limit is exhausted, per-visitor limits reset per window, two visitors under one tenant have independent budgets
- [x] Test (unit or E2E via a host-page fixture) asserts `window.DeliveryChat` exposes only `init`, `destroy`, `queue` after init; any other access returns `undefined`
- [x] Feature docs updated

---

## Phase 5: WebSocket binding & threat model (`feature/security-ws-and-threat-model`) — ✅ Complete (2026-04-23)

**User stories:** 3, 21, 22, 29, 30

### What to build

Replace query-param-only WS visitor auth with a signed short-lived token bound to `(appId, origin, visitorId)`. A server endpoint issues the token after origin + app validation; the token payload includes `appId`, `origin`, `visitorId`, `iat`, and `exp`, signed with a server-side secret (HMAC or JWT-equivalent). WS upgrade validates signature, expiry, and origin binding; any mismatch rejects with a distinct error. Token TTL is short (single-session scale). Replay from a different origin, reuse after expiry, and tampered signatures are all rejected. Finalize `packages/docs/security/threat-model.md` with the full directional threat matrix, the control addressing each threat, residual risks, and explicit documentation of the wildcard origin surface — one compromised subdomain under a wildcard entry makes the whole wildcard usable, so wildcard scope is an explicit tenant risk choice.

### Acceptance criteria

- [x] Server endpoint issues a signed short-lived WS token bound to `(appId, origin, visitorId)` with an explicit short TTL
- [x] Signing secret loaded via Infisical; never hardcoded; never logged
- [x] WS upgrade validates signature, expiry, and origin claim; each mismatch returns a distinct error code
- [x] Tests cover: issuance, successful binding, expired-token rejection, origin-mismatch rejection, replay-after-expiry rejection, tampered-signature rejection
- [x] Integration test drives a visitor through token issuance → WS upgrade → message exchange
- [x] `packages/docs/security/threat-model.md` finalized: four directional threats, controls, residual risks, wildcard surface guidance
- [x] Feature docs updated under the chat feature folder
- [x] `packages/docs/security/security-roadmap.md` updated to mark Phases 1–5 complete
