# Phase 3 — Runtime origin enforcement for test apps

Branch: `feature/test-applications-and-conflict-handling`.
Plan: `plans/test-applications-and-conflict-handling.plan.md` § Phase 3.

## What changed

- `ResolvedApplication` now carries `kind` (`production | test`) and `port`
  (`number | null`). `resolveApplicationById` and `verifyApiKey` select both
  columns; the widget bearer flow plumbs them through to the origin matcher.
- `enforceOrigin` accepts `appKind` and `appPort`. When `appKind === "test"`,
  it bypasses the allow-list and the test-environment localhost shortcut and
  requires the origin to be `http(s)://localhost(:<appPort>)` — i.e. the
  hostname must be `localhost` (or `*.localhost`) and the URL port must equal
  `String(appPort)` exactly.
- Production apps are unchanged: the existing localhost auto-allow for
  test-environment API keys is preserved so production apps remain
  debuggable from a developer's machine.

## Why port-pinning

A tenant can register multiple test apps (`kind='test'`), each on a distinct
port (enforced by the partial unique index `applications_test_port_unique`).
The declared port becomes the source of truth for which test app a widget
request belongs to. Without port-pinning, any test-env API key would auth a
widget from any localhost origin and the multi-test-app model collapses.

## Source-of-truth files

- `apps/hono-api/src/lib/security/originMatcher.ts` — `enforceOrigin`,
  `matchesTestAppOrigin`.
- `apps/hono-api/src/lib/middleware/resolveApplication.ts` — `ResolvedApplication`,
  `resolveAndEnforceOrigin`, `resolveApplicationById`.
- `apps/hono-api/src/features/api-keys/api-key.service.ts` — `verifyApiKey`
  now selects `kind` and `port` from the joined application.
- `apps/hono-api/src/lib/middleware/unifiedAuth.ts` — passes `appKind` and
  `appPort` to `enforceOrigin` for the visitor (API-key) path.

## Tests

- Unit: `apps/hono-api/src/lib/security/originMatcher.test.ts`
  - `enforceOrigin > test-kind app port pinning` — port-equality match,
    port mismatch rejected, port absent rejected, non-localhost host
    rejected, localhost shortcut bypassed for test-kind apps,
    `*.localhost:<port>` accepted when port matches.
  - `enforceOrigin > production-kind app preserves existing behavior` —
    localhost auto-allow with `keyEnvironment='test'` still works.
- Integration: `apps/hono-api/src/lib/middleware/__tests__/unifiedAuth.test.ts`
  - Widget bearer call from declared port → 200.
  - Widget bearer call from any other port → 403 `origin_not_allowed`.
