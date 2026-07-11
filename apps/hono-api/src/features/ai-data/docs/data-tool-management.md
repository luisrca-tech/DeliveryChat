# DataSource / DataTool admin management

Admin-facing CRUD for the AI data-connection feature (§4, §5 of
`plans/ai-database-connection-feature.md`). These endpoints let an ENTERPRISE
tenant admin configure **one data source per application** and a **catalog of
read-only tools** on top of it, then test and enable each tool before the
autonomous AI turn can call it.

Route folder: `apps/hono-api/src/routes/applications/data-tools/`
Registered in `src/lib/api.ts` under `/applications` (mirrors `ai-interview`).

## Endpoints

All paths are prefixed with `/applications`. All require `requireTenantAuth` +
`requireRole("admin")`; writes additionally run `checkBillingStatus`. The
`applicationId` is verified to belong to the caller's tenant (cross-tenant →
`404`). A per-org AI-add-on / DB-feature gate (`requireAiDbFeature`, T6) is wired
by the orchestrator during integration — see the `TODO(orchestrator)` marker in
`index.ts`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/:applicationId/data-source` | Redacted source config, or `null`. |
| `PUT` | `/:applicationId/data-source` | Upsert the source (secrets encrypted). |
| `GET` | `/:applicationId/data-tools` | List tools (no secrets in tool config). |
| `POST` | `/:applicationId/data-tools` | Create a tool (always `enabled: false`). |
| `PUT` | `/:applicationId/data-tools/:toolId` | Update a tool (resets test/enable). |
| `DELETE` | `/:applicationId/data-tools/:toolId` | Hard-delete a tool. |
| `POST` | `/:applicationId/data-tools/:toolId/test` | Run the tool against the live source. |
| `POST` | `/:applicationId/data-tools/:toolId/enable` | Enable/disable (enable gated on a passing test). |

## Business rules

- **Write-only secrets, never returned.** Header values (`http`) and the
  connection string (`sql`) are encrypted with `secretBox.encryptSecret` before
  storage and are **never** included in any response. `GET`/`PUT` return only
  non-secret config plus booleans (`hasConnectionString`, `hasHeaders`) and, for
  HTTP, the header *names*. On update, if the client omits the secret the
  existing encrypted value is preserved (write-only semantics).
- **allowedHost must equal the host of `baseUrl`** for HTTP sources (SSRF
  guardrail, validated at save time; enforced again by the executor at runtime).
- **Tool `backingType` must match the source `kind`.** A source must exist before
  any tool can be created.
- **SQL queries validated at save time** via `validateSqlQuery` — single
  read-only `SELECT`, no write/DDL keywords. Invalid queries are rejected `400`.
- **`inputSchema` is a flat object of primitives** (`string | number | integer |
  boolean`). Nested objects/arrays are rejected — the model-facing tools take
  scalar args only. `required` must reference declared properties.
- **Test-before-enable.** A tool is created `enabled: false`. `POST .../enable`
  with `enabled: true` requires a non-null `lastTestedAt`, otherwise `400`
  (`"tool must pass a test request before enabling"`). Disabling is always
  allowed.
- **A test is a normal outcome, not an HTTP error.** `POST .../test` returns
  `200` for both success (`{ ok: true, data }`, marks `lastTestedAt`) and failure
  (`{ ok: false, error, kind }`, does not mark tested). Success data is truncated
  to ~10 KB (`{ truncated: true, dataPreview }`) so the UI response stays bounded.
- **Any tool update resets state.** `PUT .../:toolId` sets `enabled: false` and
  `lastTestedAt: null` — a changed tool must pass a fresh test before re-enabling.

## Redaction shapes

- **HTTP source →** `{ kind: "http", enabled, baseUrl, allowedHost, hasHeaders,
  headerNames, createdAt, updatedAt }`
- **SQL source →** `{ kind: "sql", enabled, hasConnectionString, createdAt,
  updatedAt }`

## Files

- `index.ts` — Hono router + handlers (encryption, redaction, gating).
- `schemas.ts` — Zod request bodies (name regex, flat inputSchema, host match).
- `helpers.ts` — pure redaction / truncation.
- `dataAccess.ts` — Drizzle queries (mocked in tests).
- `__tests__/route.test.ts` — TDD coverage of every rule above.
