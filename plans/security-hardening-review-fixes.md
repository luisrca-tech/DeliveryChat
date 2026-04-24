# Security Hardening — Post-Review Fixes

> Source: Code review of Phases 1–5 on `feature/security-ws-and-threat-model`
> Date: 2026-04-24

---

## Fix 1: Unified Application-Scoped Auth Gate (Recommended — Start Here)

**Status:** ✅ Done

**Problem:** `widgetAuth.ts`, `apiKeyAuth.ts`, and `wsAuth.ts` all independently call `resolveApplicationById` + origin enforcement. Three test suites mock these dependencies separately with duplicated `appRow()` factories. If one middleware's resolution logic drifts from the others, the security boundary is inconsistent.

**Fix:** Extracted `resolveAndEnforceOrigin(appId, origin, options?)` in `resolveApplication.ts` that encapsulates app resolution + origin enforcement. `widgetAuth` now consumes it (reduced from 2 calls to 1). `apiKeyAuth` unchanged (gets app from `verifyApiKey`, not `resolveApplicationById`). `wsAuth` unchanged (origin checked by token, only needs `resolveApplicationById`). Test mock surface for widgetAuth dropped from mocking resolveApp + origin separately to mocking one function.

**Files changed:**
- `apps/hono-api/src/lib/middleware/resolveApplication.ts` — added `resolveAndEnforceOrigin`, `AuthorizeResult` type
- `apps/hono-api/src/lib/middleware/widgetAuth.ts` — uses `resolveAndEnforceOrigin` instead of separate resolve + enforce calls
- `apps/hono-api/src/lib/middleware/__tests__/resolveAndEnforceOrigin.test.ts` — 8 new boundary tests
- `apps/hono-api/src/lib/middleware/__tests__/widgetAuth.test.ts` — updated to mock `resolveAndEnforceOrigin`

---

## Fix 2: Empty-Origin Token Gap

**Status:** ✅ Done

**Problem:** When no `Origin` header is present, `POST /widget/ws-token` signs a token with `origin: ""`. On WS upgrade, `wsAuth.ts` also falls back to `""`. This means a token signed without an origin can be replayed from any context where the browser omits `Origin`.

**Fix:** Documented as residual risk #6 in `threat-model.md`. Code-level rejection for live keys deferred — `widgetAuth` does not currently have key-environment awareness, so the guard cannot distinguish live from test context. The 120s TTL + appId/visitorId binding mitigate the risk.

**Files changed:**
- `packages/docs/security/threat-model.md` — added residual risk #6
- `apps/hono-api/src/routes/__tests__/widget-ws-token.test.ts` — clarified test name

---

## Fix 3: Token-in-Query-String Logging Risk

**Status:** ✅ Done

**Problem:** WS tokens appear in the URL (`?token=...`), visible in access logs, proxy logs, and browser history. With 120s TTL this is low-risk but undocumented.

**Fix:** Documented as residual risk #7 in `threat-model.md`. No code change needed — this is a standard WebSocket limitation.

**Files changed:**
- `packages/docs/security/threat-model.md` — added residual risk #7

---

## Fix 4: Stale `dist/` Test Artifact

**Status:** ✅ Done

**Problem:** `chat.handlers.test.js` in `dist/` runs as a duplicate and fails due to env validation, doubling test noise.

**Fix:** Add `dist/` to Vitest exclude in hono-api config.

**Files affected:**
- `apps/hono-api/vitest.config.ts`

---

## Execution Order

1. **Fix 1** — Unified Auth Gate (highest impact, eliminates coupling)
2. **Fix 4** — Stale dist artifact (quick win, fixes CI noise)
3. **Fix 2 + 3** — Threat model documentation updates (can be batched)
