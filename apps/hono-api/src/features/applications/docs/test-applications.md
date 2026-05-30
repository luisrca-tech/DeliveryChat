# Test Applications & Conflict Handling

Comprehensive reference for the test-application model shipped on
`feature/test-applications-and-conflict-handling`. Per-phase notes live next
to this file (`phase-2-test-apps.md`, `phase-3-origin-enforcement.md`,
`phase-4-api-key-binding.md`); this document collapses them into a single
source of truth for the feature.

Source plan: `plans/test-applications-and-conflict-handling.plan.md`.
Source PRD: `plans/prd-test-applications-and-conflict-handling.md`.

## Mental model

An **application** is the boundary that pairs a customer surface (a domain or
a localhost port) with the API keys and AI context that drive its widget. The
feature introduces a second kind of application — a **test** app — so that a
tenant admin can iterate against `http://localhost:<port>` without polluting
the production-domain namespace and without granting test keys access to
real customer traffic.

| Kind         | Origin source of truth          | Uniqueness scope                 | Key environment |
| ------------ | ------------------------------- | -------------------------------- | --------------- |
| `production` | `domain` (e.g. `acme.com`)      | Globally unique per active row   | `dk_live_`      |
| `test`       | `localhost` + declared `port`   | Unique per tenant per active row | `dk_test_`      |

`kind` and `port` are **immutable after creation**. Flipping a kind would
silently change the allowed-origin model, invalidate API keys, and break
referrer-based flows — so the patch endpoint rejects both fields.

## Data model

Table: `delivery_chat_applications`. Migration: `0033_add_application_kind_and_port`.

Columns added:

- `kind` — `application_kind` enum (`production` | `test`). Default
  `production`. Backfilled to `production` on existing rows.
- `port` — nullable `integer`. Required when `kind='test'`; must be `NULL`
  when `kind='production'`.

Constraints:

- `applications_kind_port_domain_check` — CHECK ensuring
  `(kind='test' AND port IS NOT NULL AND domain='localhost') OR
  (kind='production' AND port IS NULL)`. Blocks raw-SQL inserts of malformed
  rows.
- `applications_production_domain_unique` — partial unique index on `domain`
  where `kind='production' AND deleted_at IS NULL`. Replaces the previous
  global `UNIQUE(domain)` — many tenants can now hold `domain='localhost'`
  test apps without colliding.
- `applications_test_port_unique` — partial unique index on
  `(organization_id, port)` where `kind='test' AND deleted_at IS NULL`. Two
  active test apps in the same tenant cannot share a port; soft-delete frees
  the port for re-use within that tenant.

Both partial indexes scope to non-deleted rows so the soft-delete lifecycle
hands the slot back cleanly. There is no FK from `apiKey.environment` to
`application.kind` — the binding is enforced at the API-key creation
boundary instead (see § API-key binding).

## API surface

### `POST /api/v1/applications`

Accepts a Zod discriminated union on `kind`:

```ts
// production (kind defaulted)
{ kind?: "production", name, domain, description?, settings? }

// test
{ kind: "test", name, port (1..65535), description?, settings? }
```

The schema's transform normalizes payloads before the handler runs:

- `kind='test'` → server forces `domain='localhost'`, keeps `port`.
- `kind='production'` → server forces `port=null`, validates `domain`.

The handler always sees a fully-normalized object, so the route surface
never branches on client-trust.

### `PATCH /api/v1/applications/:id`

Uses `.strict()` and **rejects** `kind` and `port` if supplied. Both fields
are immutable after create.

### 409 conflict contract

The route discriminates conflicts so the admin can render kind-specific
toasts and so cross-tenant privacy holds:

- `{ error: "DOMAIN_TAKEN", message }` — production unique-domain violation.
  Message is generic; it deliberately does **not** name the conflicting app
  (cross-tenant leak prevention).
- `{ error: "PORT_TAKEN", message, port, conflictingAppName }` — test
  unique-port violation, scoped to the same tenant. The service runs a
  fallback `SELECT` against the active test app with the same
  `(organizationId, port)` so the conflicting app's name flows back to the
  UI. Naming is safe here because both rows belong to the same tenant.

Both paths are sub-second; no pre-check exists, so there is no
TOCTOU race between the check and the insert.

### Unique-violation detection

`isUniqueViolation` (in `apps/hono-api/src/lib/db/uniqueViolation.ts`)
unwraps `DrizzleQueryError.cause` and checks the Postgres `23505` code.
Anything else re-throws — we never swallow unrelated errors as conflicts.
Before this fix the helper inspected `err.code` directly, missed the wrapped
error, and conflict paths fell through to a slow generic 500.

## Runtime origin enforcement

The origin matcher (`apps/hono-api/src/lib/security/originMatcher.ts`) gains
a `kind='test'` branch:

- `ResolvedApplication` now carries `kind` and `port`.
- `enforceOrigin` accepts `appKind` and `appPort`.
- When `appKind === "test"`, the matcher bypasses both the allow-list and
  the test-env localhost shortcut, and **requires** the origin to be
  `http(s)://localhost(:<appPort>)`. Host must be `localhost` (or
  `*.localhost`); `URL(origin).port` must equal `String(appPort)` exactly.
- When `appKind === "production"`, behavior is unchanged — the existing
  test-environment API key "auto-allow any localhost" shortcut is preserved
  so production apps stay debuggable from a developer's machine.

The declared port is the only signal that disambiguates which test app a
widget request belongs to. Without port-pinning, any test-env API key would
authenticate a widget from any localhost origin and the multi-test-app model
collapses.

Plumbing:

- `apps/hono-api/src/lib/middleware/resolveApplication.ts` — selects and
  passes `kind`/`port`.
- `apps/hono-api/src/features/api-keys/api-key.service.ts` — `verifyApiKey`
  joins `kind`/`port` onto the returned application.
- `apps/hono-api/src/lib/middleware/unifiedAuth.ts` — wires `appKind`/
  `appPort` into `enforceOrigin` for the visitor (API-key) path.

## API-key ↔ app-kind binding

`assertApiKeyEnvironmentMatchesApp(appKind, environment)` in
`features/api-keys/api-key.service.ts` enforces:

- `kind='production'` apps mint only `environment='live'` (`dk_live_…`).
- `kind='test'` apps mint only `environment='test'` (`dk_test_…`).

Mismatches throw `ApiKeyEnvironmentMismatchError`, which the route maps to
HTTP 400. Pre-existing keys are **grandfathered** — `verifyApiKey` does not
re-check the binding at request time; creation is the sole enforcement
point. This means old `dk_test_` keys on production apps continue to work,
which is what existing customers depend on for local debugging.

The admin `CreateApiKeyDialog` reads the parent application's `kind` and
locks the env dropdown to the matching value — `live` for production,
`test` for test — so the mismatched payload never reaches the API in normal
flows.

## Lifecycle summary

1. Tenant admin opens **Create Application** in the admin UI.
2. Picks Production or Test via the kind toggle. Toggling swaps fields and
   clears stale values.
3. Submits the discriminated payload. The server normalizes, validates, and
   inserts.
4. On a Postgres `23505`, the service catches, classifies, and returns
   either `DOMAIN_TAKEN` (generic) or `PORT_TAKEN` (with conflicting app
   name) as a 409. The UI renders kind-specific sonner toasts.
5. The admin mints an API key from the application detail page. The env
   dropdown is locked to match `kind`; mismatched payloads are rejected
   with 400.
6. The widget script boots, calls the bearer flow, and the origin matcher
   accepts the request only if the origin matches the kind's rule —
   production domain or pinned localhost port.
7. Soft-deleting the application frees its domain slot (production) or
   port slot (test) within its uniqueness scope.

## Tests of record

- `apps/hono-api/src/lib/db/uniqueViolation.test.ts` — DrizzleQueryError
  unwrap + `23505` detection.
- `apps/hono-api/src/features/applications/application.service.test.ts` —
  discriminated-union accept/reject, port uniqueness scope, soft-delete +
  recreate, conflict shape.
- `apps/hono-api/src/lib/security/originMatcher.test.ts` — port-equality
  match, mismatch rejected, localhost shortcut bypassed for test apps,
  production behavior preserved.
- `apps/hono-api/src/lib/middleware/__tests__/unifiedAuth.test.ts` — widget
  bearer call from declared vs other port.
- `apps/hono-api/src/features/api-keys/api-key.service.test.ts` —
  `assertApiKeyEnvironmentMatchesApp` accept/reject matrix and grandfather
  test.
- Admin: `CreateApplicationDialog.test.tsx` (kind toggle, payload shape,
  toast routing) and `CreateApiKeyDialog.test.tsx` (locked dropdown).

## Deferred alternative

A Stripe-style "global test-mode toggle on the tenant" was considered and
deferred. See `packages/docs/todo/global-test-mode-toggle.md` for the
trade-off analysis and the signal that would justify revisiting it.
