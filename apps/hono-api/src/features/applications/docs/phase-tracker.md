# Test Applications & Conflict Handling — Phase Tracker

Tracks progress against `plans/test-applications-and-conflict-handling.plan.md`.
Branch: `feature/test-applications-and-conflict-handling`.

Update one row per phase as work lands. Keep notes terse: link to the commit
and to any phase-local docs added in this folder.

| Phase | Title                                          | Status      | Commit(s) | Notes |
| ----- | ---------------------------------------------- | ----------- | --------- | ----- |
| 1     | Fix unique-violation conflict detection        | ✅ Completed | TBD       | `isUniqueViolation` now walks `err.cause.code` so Drizzle-wrapped `23505` is detected. Conflict path returns 409 fast instead of falling through to a 500. |
| 2     | Test application end-to-end (create flow)      | ✅ Completed | TBD       | Schema adds `kind`/`port` + CHECK + partial unique indexes. Zod discriminated union forces `domain='localhost'` for test apps and validates port range. Service returns `DOMAIN_TAKEN`/`PORT_TAKEN` with conflicting app name. Admin dialog gains kind toggle, port input, `localhost:<port>` preview, pin tooltip, distinct toasts. See `phase-2-test-apps.md`. |
| 3     | Runtime origin enforcement for test apps       | ✅ Completed | TBD       | `enforceOrigin` accepts `appKind`/`appPort`; for `kind='test'` apps the URL port must equal the declared port and the localhost auto-allow shortcut is bypassed. Production apps unchanged. See `phase-3-origin-enforcement.md`. |
| 4     | API key environment ↔ app-kind binding         | ✅ Completed | TBD       | `assertApiKeyEnvironmentMatchesApp` rejects mismatched env at API-key creation: test apps mint only `dk_test_`, production apps only `dk_live_`. Route maps to 400. Admin create dialog locks the env dropdown to the parent app's `kind`. See `phase-4-api-key-binding.md`. |
| 5     | Cross-cutting documentation                    | ⏳ Pending   | —         | Feature doc, public doc, deferred Stripe-style alternative TODO. |

## Conventions

- Each phase ships on this single feature branch and merges into `development`
  via one or more scoped commits.
- Phase-local notes (data model, lifecycle, decisions) live next to this file
  in `apps/hono-api/src/features/applications/docs/`.
- Update the row above the moment a phase merges — keep the tracker honest.
