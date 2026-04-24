# Security Roadmap — Widget Hardening

**Status:** Phases 1–2 complete (2026-04-23) — Phases 3–5 pending
**Date:** 2026-04-18 (last updated 2026-04-23)
**Plan file:** `plans/widget-security-hardening-execution.md`

---

## Why this roadmap exists

The DeliveryChat widget ships as a **Shadow DOM IIFE** embedded into the host page's JavaScript realm — not as a cross-origin iframe with a `postMessage` bridge. That is a deliberate architectural choice suited to the product (anonymous support chat), but it shifts the responsibility for XSS, abuse, and origin enforcement from "the browser's same-origin policy" to "our own code and documentation."

This roadmap captures the agreed-upon controls, ordered by delivery, that bring the widget in line with its actual threat model.

## Decisions already locked

- **Architecture:** Shadow DOM + harden. Iframe migration deferred until a future feature requires it (authenticated visitors, sensitive data at rest in the widget, payments flowing through the widget).
- **Origin enforcement:** Per-application allow-list (`applications.allowedOrigins: text[]`), strict for `dk_live_*` keys, lenient-on-localhost for `dk_test_*` keys.
- **Rendering rule:** All dynamic content uses `textContent`; `innerHTML`/`insertAdjacentHTML`/`outerHTML` are reserved for static strings only, enforced by lint.

## What Shadow DOM protects — and what it does not

| Protection | Shadow DOM | Cross-origin iframe |
|---|---|---|
| CSS isolation | ✔ | ✔ |
| DOM query isolation | ✔ | ✔ |
| JavaScript realm isolation from host | ✘ | ✔ |
| Host cannot read widget memory / closures | ✘ | ✔ |
| Host cannot monkey-patch `fetch` / `WebSocket` observed by widget | ✘ | ✔ |
| Host cannot read widget DOM via prototype tricks | Partial | ✔ |

Shadow DOM is a **style/DOM scoping mechanism**, not a security boundary. This roadmap is the compensating set of controls.

## Phase 1 delivery slices

Each slice ships on its own feature branch and PR.

1. ✅ **Content safety + lint enforcement + threat-model skeleton** — `feature/security-content-safety` (complete 2026-04-23)
2. ✅ **Loader supply chain (SRI) + published CSP recommendation** — `feature/security-loader-integrity` (complete 2026-04-23)
3a. ⬜ **Origin allow-list — server** — `feature/security-origin-allowlist-server`
3b. ⬜ **Origin allow-list — admin UI** — `feature/security-origin-allowlist-admin`
4. ⬜ **Per-visitor abuse protection + `window.DeliveryChat` surface minimization** — `feature/security-abuse-protection`
5. ⬜ **WebSocket token binding audit + final threat-model doc** — `feature/security-ws-and-threat-model`

Full rationale, per-slice scope, and tests are in `docs/superpowers/plans/widget-security-hardening.md`.

## Documentation layout

- `packages/docs/security/security-roadmap.md` — this file (north star).
- `packages/docs/security/threat-model.md` — populated across slices 1 and 5.
- `packages/docs/security/origin-enforcement.md` — added in slice 3.
- `packages/docs/security/integrator-guide.md` — added in slices 2 and 4.
- Per-slice feature docs live alongside the code in `apps/*/src/features/*/docs/`.

## Out of scope for Phase 1

- Trusted Types CSP directive inside the widget.
- Playwright-based security regression suite (deferred to Phase 2).
- Per-API-key origin binding at creation time (subsumed by the allow-list for Phase 1).
- Migration to cross-origin iframe — revisited only if the product introduces authenticated visitors, long-lived visitor secrets, or payment processing in the widget.
