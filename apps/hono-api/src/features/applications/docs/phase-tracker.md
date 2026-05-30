# Test Applications & Conflict Handling — Phase Tracker

Tracks progress against `plans/test-applications-and-conflict-handling.plan.md`.
Branch: `feature/test-applications-and-conflict-handling`.

Update one row per phase as work lands. Keep notes terse: link to the commit
and to any phase-local docs added in this folder.

| Phase | Title                                          | Status      | Commit(s) | Notes |
| ----- | ---------------------------------------------- | ----------- | --------- | ----- |
| 1     | Fix unique-violation conflict detection        | ✅ Completed | TBD       | `isUniqueViolation` now walks `err.cause.code` so Drizzle-wrapped `23505` is detected. Conflict path returns 409 fast instead of falling through to a 500. |
| 2     | Test application end-to-end (create flow)      | ⏳ Pending   | —         | Migration + discriminated-union schema + admin form. |
| 3     | Runtime origin enforcement for test apps       | ⏳ Pending   | —         | Port-aware origin matcher; remove localhost shortcut for `kind='test'`. |
| 4     | API key environment ↔ app-kind binding         | ⏳ Pending   | —         | `dk_test_` ↔ `kind='test'`, `dk_live_` ↔ `kind='production'`. |
| 5     | Cross-cutting documentation                    | ⏳ Pending   | —         | Feature doc, public doc, deferred Stripe-style alternative TODO. |

## Conventions

- Each phase ships on this single feature branch and merges into `development`
  via one or more scoped commits.
- Phase-local notes (data model, lifecycle, decisions) live next to this file
  in `apps/hono-api/src/features/applications/docs/`.
- Update the row above the moment a phase merges — keep the tracker honest.
