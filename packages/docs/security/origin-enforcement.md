# Origin Enforcement

**Slice:** Phase 3a + 3b — `feature/security-origin-allowlist-server` / `feature/security-origin-allowlist-admin`
**Status:** Complete (server + admin UI)
**Last updated:** 2026-04-23

---

## Summary

Every widget-bound API call is checked against a per-application origin allow-list stored in `applications.allowedOrigins` (Postgres `text[]`). Origin enforcement is consistent across the middleware layer: it is applied on every request, not only on CORS preflight.

Live-mode API keys (`dk_live_*`) enforce the allow-list strictly. Test-mode API keys (`dk_test_*`) additionally allow the localhost set.

## Schema

```ts
applications.allowedOrigins: text[]   // default '{}', notNull
```

The column lives alongside the existing `applications.domain` field. `domain` remains the human-facing canonical record for the app; `allowedOrigins` is the list actually checked at request time. Phase 3b moves the source of truth fully to the allow-list.

## Matching semantics

Implemented in `apps/hono-api/src/lib/security/originMatcher.ts` as a pure function; no database access, no I/O.

| Input | Matches |
|---|---|
| `example.com` | `https://example.com`, `https://www.example.com` (implicit www equivalence, both directions) |
| `www.example.com` | `https://example.com`, `https://www.example.com` |
| `*.example.com` | `https://example.com` (apex) and any subdomain (`https://app.example.com`, `https://foo.bar.example.com`) |
| anything | Hostname compared case-insensitively |
| `http(s)://localhost`, `http(s)://localhost:*`, `*.localhost` | Allowed **only** when `testMode=true` |

Notable negatives:
- Missing `Origin` header → rejected by `apiKeyAuth` (no origin, no check, no pass). `widgetAuth` preserves today's "skip if absent" for backward compat.
- Non-wildcard entry **does not** cover subdomains. `example.com` does **not** match `evil.example.com`. This is a deliberate tightening vs. the legacy `validateOrigin()` which used `endsWith` and accidentally let subdomains through.
- `127.0.0.1` is not covered by test-mode leniency — only `localhost` and `*.localhost`.
- Unparseable origins → rejected.

## Who calls what

| Middleware | `testMode` signal | Missing origin |
|---|---|---|
| `widgetAuth` (X-App-Id only, no key) | `process.env.NODE_ENV !== "production"` | allowed (legacy) |
| `apiKeyAuth` (Bearer `dk_*`) | `apiKey.environment === "test"` | rejected |
| `authenticateWebSocket` (widget path) | `process.env.NODE_ENV !== "production"` | allowed (Phase 5 overhauls this) |

Both `widgetAuth` and `apiKeyAuth` return HTTP 403 with a body that distinguishes origin rejection from other auth failures:

```json
{
  "error": "origin_not_allowed",
  "message": "Origin is not in the application allow-list"
}
```

Other 403s continue to use the generic `"Forbidden"` error string, so operators and integrators can tell the two apart.

## Migration & backfill

The schema change itself is mechanical (`bun run db:generate`, then `bun run db:migrate`). The seed step has a wildcard guard and is therefore not part of the Drizzle migration.

Operator runs:

```bash
# Safe: only non-wildcard domains seeded; wildcards surfaced and migration aborts
bun run backfill:allowed-origins --filter=hono-api

# After reviewing the listed wildcard apps, re-run with confirmation
bun run backfill:allowed-origins --filter=hono-api -- --confirm-wildcards

# Dry run (no writes)
bun run backfill:allowed-origins --filter=hono-api -- --dry-run
```

The script scans `applications`, identifies rows where `allowedOrigins = '{}'`, reports wildcard domains requiring human review, and seeds `allowedOrigins = ARRAY[domain]` for each confirmed app. Silent wildcard carry-forward is prohibited.

## Integration test matrix (Phase 3a acceptance)

| Key env | Allow-list entry | Origin | Expected |
|---|---|---|---|
| live | `example.com` | `https://example.com` | 200 |
| live | `*.example.com` | `https://shop.example.com` | 200 |
| live | `example.com` | `http://localhost:3000` | 403 `origin_not_allowed` |
| live | `example.com` | `https://evil.com` | 403 `origin_not_allowed` |
| test | `example.com` | `http://localhost:3001` | 200 (test-mode leniency) |
| test | `example.com` | `http://tenant.localhost` | 200 |
| test | `example.com` | `https://evil.com` | 403 |
| — | — | (missing) | 403 (apiKeyAuth) / 200 (widgetAuth) |

## Admin UI (Phase 3b)

The application edit dialog in `apps/admin` includes an "Allowed Domains" section where admins can manage the origin allow-list per application.

### Validation

- Each entry is validated client-side against `DOMAIN_REGEX` (from `@repo/types`).
- Entries are lowercased on input.
- Duplicates are rejected with inline error feedback.
- Wildcard entries (`*.example.com`) are accepted.
- Server-side validation mirrors the client rules via `updateApplicationSchema`.

### API

`PATCH /applications/:id` accepts an optional `allowedOrigins: string[]` field. The schema validates each entry against `DOMAIN_REGEX`, lowercases all entries, and rejects duplicates.

## Residual risks surfaced by this slice

- **Wildcard scope is a tenant-controlled risk.** One compromised subdomain under `*.example.com` makes the whole wildcard usable. Phase 3b admin UI will surface this in inline guidance.
- **Non-browser clients bypass `Origin`.** `apiKeyAuth` rejects missing origins, closing that door for now. A future server-to-server key flavor (if added) must reopen it deliberately.
- **`widgetAuth` still allows requests with no `Origin` header.** Acceptable for the current public-widget surface but should be revisited if richer widget endpoints are added.
