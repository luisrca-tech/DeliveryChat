# Phase 4 — API key environment ↔ app-kind binding

## Rule

- `kind='production'` applications may only mint `environment='live'` API keys (`dk_live_...`).
- `kind='test'` applications may only mint `environment='test'` API keys (`dk_test_...`).
- Mismatches are rejected at the API-key creation boundary with HTTP 400.
- Pre-existing keys are **grandfathered** — no retroactive enforcement, no DB cleanup. `verifyApiKey` does not re-check the binding at request time; the only enforcement point is creation.

## Implementation

- `assertApiKeyEnvironmentMatchesApp(appKind, environment)` in `features/api-keys/api-key.service.ts` throws `ApiKeyEnvironmentMismatchError` on mismatch.
- The applications route `POST /:id/api-keys` invokes the helper after loading the parent application and maps `ApiKeyEnvironmentMismatchError` to `jsonError(400, BAD_REQUEST)`.
- The application list response now exposes `kind` and `port`, so the admin frontend can render the API-key dialog with the env dropdown locked to the matching value.
- Admin `CreateApiKeyDialog` accepts an `appKind` prop, derives the locked environment (`live` for production, `test` for test), disables the Radix Select, and forces the submitted payload to the locked value regardless of internal form state.

## Tests

- Unit: `assertApiKeyEnvironmentMatchesApp` accepts the four (kind × env) combinations and rejects the two mismatches.
- RTL: `CreateApiKeyDialog.test.tsx` asserts the dropdown is disabled for both kinds and that submit sends the correct `environment`.
