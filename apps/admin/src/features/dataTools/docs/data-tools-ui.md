# Data Tools admin UI

Admin dashboard for configuring the AI's DataSource (how it reaches a
tenant's systems) and DataTools (named, read-only capabilities the AI can
call at runtime). Backend: `apps/hono-api/src/routes/applications/data-tools/`.
Design intent: `plans/ai-database-connection-feature.md` §5.

## Feature gate

Every endpoint under `/applications/:applicationId/data-source` and
`/applications/:applicationId/data-tools*` is gated by `requireAiAddon()`
(plan ∈ {PREMIUM, ENTERPRISE} + `aiAddonActive`) — the same gate as the rest of
the AI feature. A 403 with `error: "ai_addon_not_active"` is mapped client-side
to `DataToolsFeatureLockedError` (see `lib/dataTools.client.ts`) and rendered as
`FeatureLockedCard` — a locked-state explainer card with a **Go to Billing**
button linking to `/settings/billing`, never an error toast.
`DataToolsPage` treats this as the only "expected" error state; any other
query error still surfaces the query's default loading/error UI.

## Write-only secrets

`applicationDataSource.config` stores encrypted secrets (`encryptedHeaders`
for HTTP, `encryptedConnectionString` for SQL). The GET endpoint never returns
them — only booleans/derived metadata (`hasHeaders`, `headerNames`,
`hasConnectionString`). The PUT body therefore treats secrets as **optional
and write-only**:

- HTTP headers: `DataSourceSection` renders each existing header name with a
  placeholder ("•••• (saved)") and no way to view its value. Only _new or
  removed_ header names cause the `headers` field to be sent on save;
  otherwise it is omitted so the backend preserves the previously encrypted
  values.
- SQL connection string: rendered as a password-style input. Leaving it blank
  on save omits `connectionString` from the PUT body, preserving the current
  value. It is required only the first time a SQL source is created.

## Test-before-enable

A DataTool can only be flipped to `enabled: true` after a successful
`POST .../data-tools/:toolId/test` call, tracked server-side via
`lastTestedAt`. Any subsequent edit to the tool (name, description, schema,
config) resets `enabled` and `lastTestedAt` to force a fresh test. The UI
mirrors this exactly:

- The Enable switch inside `DataToolDialog` is disabled (with a tooltip
  explaining why) until `savedTool.lastTestedAt` is set.
- A tool must be saved (created) before it can be tested — the test panel
  needs a `toolId` to call `/test` against. The dialog therefore treats "not
  yet saved" and "saved but not tested" as distinct states.
- Saving an already-tested tool again clears the local test result and
  disables Enable again, matching the server-side reset.

## Metadata is the product

Per the design doc, the model decides when to call a tool purely from its
name + description + input schema — there is no other signal. The dialog
therefore:

- Requires a description of at least 10 characters (enforced by the backend
  zod schema too) with helper copy nudging toward specificity.
- Builds the input schema through a guided `ParamSchemaBuilder` (name / type /
  required) instead of asking the admin to hand-write JSON Schema. A "raw
  JSON" toggle is available for power users who need something the builder
  doesn't expose (the builder only supports the flat, scalar-only shape the
  executor accepts — see `apps/hono-api/src/features/ai-data/types.ts`).
- Note: the backend's `ToolPropertySchema` only carries a `type` — there is no
  per-parameter `description` field in the persisted schema. The builder does
  not offer one either, to avoid an input that silently gets dropped on save.

## Backing type is locked to the source kind

The backend rejects a tool whose `backingType` does not match the
application's configured `DataSource.kind` (`ensureToolMatchesSource`). The
dialog does not expose a `backingType` selector — it derives the effective
kind from the existing tool (edit) or the current data source (create) and
blocks tool creation entirely until a data source is configured.

## Navigation entry point

"Data tools" is added as a dropdown action in `ApplicationListTable`,
alongside the existing "AI Interview" / "View AI context" action — the same
per-application action-menu pattern, not a separate settings index page
(there isn't one for `ai-context` either).

## Page layout

The page mirrors the applications-list pattern (`ApplicationsPage` +
`ApplicationListTable`): a compact summary above a table, with a dialog for
create/edit and a `ConfirmDialog` for delete.

- **`ConnectionCard`** — a compact card above the table showing the source
  kind badge (`HTTP`/`SQL`), the host (parsed from `baseUrl`, HTTP) or
  `"SQL database"` (SQL), and a credentials-status line (`"credentials
saved"` vs. `"no … saved"`, derived from `hasHeaders` /
  `hasConnectionString` — never the secret itself). An **"Edit connection"**
  button opens `ConnectionDialog`. When no source exists yet, the card
  instead renders a `"Connect a data source"` empty state with a button that
  opens the same dialog.
- **`ConnectionDialog`** — a `Dialog` wrapping `DataSourceSection`'s form
  unchanged (kind select, HTTP/SQL fields, write-only secrets). Previously
  this form rendered inline inside its own `Card`; it now renders bare inside
  the dialog's `DialogContent`, since the dialog chrome replaces the card.
- **`DataToolsTable`** — the tools table (replaces the old
  `DataToolsSection` list). Header row has the section title/description on
  the left and a **"+ New data tool"** button on the right (disabled until a
  data source exists). Each row has an "..." (`DropdownMenu`) actions column
  with **Edit** (opens `DataToolDialog` for that tool) and **Delete** (opens
  the existing `ConfirmDialog`) — same pattern as `ApplicationListTable`'s
  row actions, replacing the old direct trash-icon button and
  click-row-to-edit affordance.
- `DataToolsPage` renders `ConnectionCard` always (once past the
  loading/locked branches), and `DataToolsTable` only when a data source
  exists — the backend already requires a source before creating tools, so
  the table is hidden rather than shown-and-disabled when there is none.

## Files

- `types/dataTools.types.ts` — response/request shapes mirrored from
  `apps/hono-api/src/routes/applications/data-tools/{schemas,helpers}.ts`.
  `DataTool` is a discriminated union on `backingType` so `config` narrows
  without a cast.
- `lib/dataTools.client.ts` — fetch-based client (mirrors
  `features/applications/lib/applications.client.ts` and
  `features/aiInterview/lib/aiInterview.client.ts` — this codebase does not
  use the `hc<APIType>` RPC client for feature calls).
- `hooks/` — TanStack Query v5 hooks per endpoint; no `useEffect` fetching.
- `components/DataToolsPage.tsx` — composition root + the feature-gate branch.
- `components/ConnectionCard.tsx` — compact connection summary + empty state.
- `components/ConnectionDialog.tsx` — dialog wrapping `DataSourceSection`.
- `components/DataSourceSection.tsx` — HTTP/SQL source form (no longer
  self-carded; rendered inside `ConnectionDialog`).
- `components/DataToolsTable.tsx` — tool table + row actions + delete
  confirm.
- `components/DataToolDialog.tsx` — create/edit + test panel + enable toggle.
- `components/ParamSchemaBuilder.tsx` — guided param builder, pure
  `paramRowsToSchema` / `schemaToParamRows` helpers (unit tested).
- `components/FeatureLockedCard.tsx` — locked-state card.
- `lib/dataToolForm.ts` — pure form logic extracted from `DataToolDialog`
  (see below); the dialog now only wires state to these functions.

## Extracted form seam (`lib/dataToolForm.ts`)

The validation, coercion, payload-shaping, and enable-gate rules used to be
inlined in `DataToolDialog`. They now live in `lib/dataToolForm.ts` as pure,
unit-tested functions so each rule can be verified without rendering the
dialog. The dialog keeps only wiring/state:

- `NAME_REGEX` / `MIN_DESCRIPTION_LENGTH` — the name pattern (leading letter,
  then letters/digits/underscores) and the 10-character description floor,
  mirrored by the backend zod schema.
- `dataToolFormSchema` / `DataToolFormValues` — the React Hook Form zod schema
  (via `zodResolver`): valid name, description ≥ 10 chars, non-empty config,
  and — in raw JSON mode — parseable `rawJsonText`.
- `toDataToolFormValues(tool)` — maps a saved tool (or `null` for the create
  flow) to the form's default values.
- `resolveToolSchema(values)` — the inputSchema the form currently expresses:
  guided builder rows or parsed raw JSON (`null` when unparseable).
- `buildDataToolBody(inputs)` — the create/update payload, discriminated on the
  backing kind, or `null` when a precondition is unmet. Trims
  name/description/config and strips line breaks from HTTP URL templates.
- `coerceParam(row, raw)` / `coerceParams(rows, values)` — coerce raw string
  test-inputs into their declared JSON types. Numbers that fail to parse fall
  back to the raw string (the backend then reports the validation error);
  booleans are strict `"true"` vs. anything-else.
- `canEnableTool(tool)` — the security-relevant test-before-enable gate
  (`Boolean(tool?.lastTestedAt)`).
- `planDataToolSave({ savedTool, fieldsDirty, enabled })` — what one
  "Save changes" click must do, in order: persist edited fields, then apply the
  pending enabled/disabled switch only if the test gate still holds (a field
  edit resets it server-side, so a wanted enable alongside an edit is blocked
  until a fresh test).

The dialog uses React Hook Form (`useForm` + `zodResolver`, matching
`DataSourceSection`): `formState.isDirty` drives the save plan,
`formState.isValid` gates the save button, and the dialog body remounts on
every open (Radix unmounts closed content), so there is no reset effect. The
Enabled switch is deliberately _not_ a form field — it is pending
server-workflow state applied only on save via the enable endpoint.

Covered by `lib/dataToolForm.test.ts` (name-regex edges, the 9-vs-10 char
description boundary, the coercion table, both backing-type payloads, form
schema acceptance/rejection, tool→form-values mapping, schema resolution, the
save plan matrix, and the null-vs-set `lastTestedAt` enable gate).

## Testing

`apps/admin` has an existing Vitest + Testing Library setup
(`vitest.config.ts`, `src/**/*.test.{ts,tsx}`). Added:

- `lib/dataTools.client.test.ts` — mocks `fetch` (mirrors
  `applications.client.test.ts`), covers the success path and the
  403/409/400 error-mapping branches.
- `components/ParamSchemaBuilder.test.tsx` — pure-function tests for the
  schema ⇄ rows conversion, including the round-trip and empty/blank-name
  edge cases.

No component-level tests were added for `DataToolDialog` / `DataSourceSection`
/ `ConnectionCard` / `ConnectionDialog` / `DataToolsTable` (no existing
precedent in this codebase for testing a dialog or table this shape —
`AiContextPage`/`InterviewComposer` etc. are similarly untested at the
component level); `check-types` and `eslint` are the verification gates for
those, per the existing convention.
