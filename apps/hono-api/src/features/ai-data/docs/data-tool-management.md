# DataSource / DataTool admin management

Admin-facing CRUD for the AI data-connection feature (§4, §5 of
`plans/ai-database-connection-feature.md`). These endpoints let a tenant admin
with the AI add-on configure **one data source per application** and a
**catalog of read-only tools** on top of it, then test and enable each tool
before the autonomous AI turn can call it.

Route folder: `apps/hono-api/src/routes/applications/data-tools/`
Registered in `src/lib/api.ts` under `/applications` (mirrors `ai-interview`).

## Endpoints

All paths are prefixed with `/applications`. All require `requireTenantAuth` +
`requireRole("admin")`; writes additionally run `checkBillingStatus`. The
`applicationId` is verified to belong to the caller's tenant (cross-tenant →
`404`). Every route is gated by the AI add-on entitlement (`requireAiAddon`):
plan ∈ {PREMIUM, ENTERPRISE} **and** `organization.aiAddonActive` — the same
gate as the rest of the AI feature, for both HTTP- and SQL-backed tools.

| Method   | Path                                        | Purpose                                          |
| -------- | ------------------------------------------- | ------------------------------------------------ |
| `GET`    | `/:applicationId/data-source`               | Redacted source config, or `null`.               |
| `PUT`    | `/:applicationId/data-source`               | Upsert the source (secrets encrypted).           |
| `GET`    | `/:applicationId/data-tools`                | List tools (no secrets in tool config).          |
| `POST`   | `/:applicationId/data-tools`                | Create a tool (always `enabled: false`).         |
| `PUT`    | `/:applicationId/data-tools/:toolId`        | Update a tool (resets test/enable).              |
| `DELETE` | `/:applicationId/data-tools/:toolId`        | Hard-delete a tool.                              |
| `POST`   | `/:applicationId/data-tools/:toolId/test`   | Run the tool against the live source.            |
| `POST`   | `/:applicationId/data-tools/:toolId/enable` | Enable/disable (enable gated on a passing test). |

## Business rules

- **Write-only secrets, never returned.** Header values (`http`) and the
  connection string (`sql`) are encrypted with `secretBox.encryptSecret` before
  storage and are **never** included in any response. `GET`/`PUT` return only
  non-secret config plus booleans (`hasConnectionString`, `hasHeaders`) and, for
  HTTP, the header _names_. On update, if the client omits the secret the
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

## Dogfooding

DeliveryChat registers **its own** public API
(`GET /api/v1/public/*`, see `src/routes/docs/public-api.md`) as HTTP
DataTools on its own tenant, so the widget's AI assistant can answer pricing
**and product/documentation** questions from live data instead of a hardcoded
blurb in the system prompt. Three tools are registered against one HTTP data
source, via this same admin CRUD:

1. `PUT /:applicationId/data-source` with `kind: "http"`,
   `baseUrl: "<tunnel-or-public-host>"`, `allowedHost` matching that host.
2. `POST /:applicationId/data-tools` — create the three tools:
   - **`getPlanInfo`** — `backingType: "http"`,
     `urlTemplate: "/api/v1/public/plans"`, empty `inputSchema` (the endpoint
     takes no params). Description e.g. _"Returns DeliveryChat's plans with
     names, monthly prices (BRL/USD) and limits. Call this whenever the
     visitor asks about pricing, plan tiers, or feature limits."_
   - **`searchDocs`** — `urlTemplate: "/api/v1/public/docs/search?q={query}"`,
     `inputSchema: { query: string }`. Description e.g. _"Full-text search over
     DeliveryChat's documentation (widget install, SDK methods, REST API).
     Returns matching pages with a title, url and snippet. Use this FIRST to
     locate the right page for any 'how do I…' question, then fetch it with
     getDocsPage."_
   - **`getDocsPage`** — `urlTemplate: "/api/v1/public/docs/pages/{slug}"`,
     `inputSchema: { slug: string }`. Description e.g. _"Fetches the full text
     of one documentation page by its slug (from a searchDocs result, e.g.
     'sdk/methods'). Use this to read the actual instructions/code before
     answering."_
3. `POST .../data-tools/:toolId/test` against the live endpoint, then
   `POST .../enable`.

**Tool descriptions drive model behavior.** The model chooses which tool to
call, and with what arguments, almost entirely from these descriptions — not
from the endpoint's code. Spell out _when_ to call each tool and _how they
chain_ (search → get page), so the assistant grounds answers in a real page
instead of guessing. This is the same "escalate, never fabricate" guarantee:
the model only states what a tool actually returned.

**Dev-environment caveat:** the SSRF guard (`ssrfGuard.ts`) rejects any
`allowedHost` that resolves to a private/loopback address, which blocks
`localhost` — the same restriction that protects tenants from pointing tools
at internal infrastructure applies to us too. In local development, expose
`hono-api` through a public tunnel (e.g. ngrok/Cloudflare Tunnel) and use the
tunnel's public host as `baseUrl`/`allowedHost` instead of `localhost:8000`.
In staging/production the tool's `baseUrl` is the real public API host, so
this only matters for local dogfooding.
