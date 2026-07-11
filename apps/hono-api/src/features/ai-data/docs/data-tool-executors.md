# DataTool executors (HTTP + SQL)

This module (`features/ai-data/`) is the execution layer for admin-configured,
strictly **read-only** "DataTools" that the AI turn calls to answer visitor
questions from a customer's own system. The model only ever sees a tool's
`name` / `description` / `inputSchema`; the backing (an HTTP GET or a SQL
`SELECT`) is server-side and never exposed. That is what makes read-only true
**by construction** — the model cannot reach past the tools we defined.

## Public API

```ts
executeDataTool({ applicationId, tool, source, params }): Promise<DataToolResult>
```

- `DataToolResult` = `{ ok: true, data } | { ok: false, error, kind }`,
  `kind ∈ 'validation' | 'execution' | 'timeout'`.
- **Errors are RETURNED, never thrown**, so the AI turn can feed a failure into
  its escalation policy ("when in doubt, escalate — never fabricate"). Internal
  diagnostics are logged (no silent failures); logs never contain decrypted
  secrets, connection strings, or param-substituted URLs.

Also exported for direct testing / reuse:
`executeHttpTool`, `executeSqlTool`, `validateParams`, `orderedParamNames`,
`validateSqlQuery`, `hasLimitClause`, `isPrivateAddress`.

## Business rules

- **Read-only by construction.** HTTP tools are always `GET` (the method is
  hard-coded, never read from config or params). SQL tools execute only a stored
  `SELECT`; a save-time validator (`validateSqlQuery`) rejects any write/DDL.
- **The AI never composes the request.** URL paths come from a stored
  `urlTemplate`; SQL comes from a stored `query`. The model only supplies
  primitive parameter values, which are validated and bound safely.
- **Fail closed.** Any guardrail violation returns an error result rather than
  making a best-effort request.

## Parameter validation (`paramValidator.ts`)

No JSON Schema library exists in the workspace and adding one was out of scope,
so validation is a minimal, purpose-built check. **Constraint (intentional):**
tool `inputSchema`s are **flat objects of primitives** —
`string | number | integer | boolean`. Nested objects/arrays are not supported.

- `required` fields must be present and non-null.
- Each provided property declared in `properties` must match its declared type.
- Unknown properties (not in `properties`) are ignored.
- A validation failure short-circuits with `kind: 'validation'` before any
  backing executor runs.

## HTTP backing (`httpExecutor.ts`) — SSRF guardrails

1. **Host allowlist.** The final URL's hostname must exactly equal the source's
   `allowedHost`.
2. **DNS egress filtering.** The host is resolved (`node:dns/promises` `lookup`,
   all addresses); any private/reserved address rejects the request:
   `10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16`, `0.0.0.0`, `::1`,
   `fc00::/7`, `fe80::/10`, and IPv4-mapped IPv6 forms. Unknown families fail
   closed. (See `ssrfGuard.ts`.)
3. **No redirects.** `redirect: 'manual'`; a 3xx / opaque-redirect response is an
   execution error (defeats redirect-to-internal SSRF).
4. **Timeout.** `AbortSignal.timeout(5000)` → `kind: 'timeout'`.
5. **Response size cap.** 256 KB, enforced on `content-length` (fast path) and on
   the actual body length after reading.
6. **JSON only.** A non-JSON body is an execution error.

Configured headers (`encryptedHeaders`) are decrypted **per request** via
`decryptSecret`; decrypted values are never logged. Only validated params are
substituted into the template, URL-encoded; an unresolved `{placeholder}` is an
execution error.

## SQL backing (`sqlExecutor.ts`)

- **`pg` connection pools, one per application.** Module-level `Map` keyed by
  `applicationId`, `max: 2`, `statement_timeout: 5000`, created lazily. **FIFO
  eviction** beyond 20 pools: the oldest pool is `end()`ed and dropped (Map
  insertion order = age). Boring on purpose; Redis/shared pooling is a later
  concern.
- **Positional param binding.** Only the stored `query` runs, with `$1..$n` bound
  from the validated params in the **schema `properties` key order**
  (`orderedParamNames`). This ordering is deterministic (JS object key insertion
  order, preserved by stored jsonb) and is the documented contract between the
  tool's `inputSchema` and its `$n` placeholders.
- **Defense in depth.** `validateSqlQuery` runs again at execution time even
  though the CRUD layer validates at save time. It guarantees a single
  read-only statement: comments stripped first (defeats comment-smuggled writes),
  no interior `;` (single statement), must start with `SELECT`, and no
  word-boundary-matched write/DDL keywords
  (`insert|update|delete|drop|alter|create|grant|truncate|copy|execute|do|into`).
  Word boundaries keep column names like `created_at` / `updated_at` safe.
  *Known limitation:* a string literal that exactly equals a forbidden keyword
  (e.g. `status = 'delete'`) is falsely rejected — acceptable for an admin-
  curated, save-time defense-in-depth check.
- **Row + size caps.** If the query lacks a `LIMIT`, ` LIMIT 50` is appended
  (`DEFAULT_ROW_LIMIT`). The serialized result is capped at 256 KB.
- Connection strings are decrypted per call and never logged (raw or decrypted).

## Technical decisions

- **Single abstraction, pluggable backing.** `executeDataTool` validates params
  once, then dispatches on `tool.backingType`. HTTP and SQL are interchangeable
  from the AI's perspective.
- **Return-don't-throw error contract.** Enables the escalation policy to treat
  "tool failed / empty" uniformly and flip to a human instead of hallucinating.
- **No new dependencies.** Reuses `pg` (already a dep via Drizzle),
  `node:dns/promises`, `node:crypto`-based `secretBox`, and a hand-rolled param
  validator.
