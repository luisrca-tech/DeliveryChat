# AI Autonomous Assistant

## Overview

The autonomous AI Assistant lets the AI answer a visitor **directly in the chat
widget** — no operator has to be online — by reading tenant data through
admin-configured tools, and escalating to a human whenever it cannot help or
the visitor asks for one. This is distinct from the operator-assist AI
described in [AI Assistant](ai-assistant.md) (Generate Reply / Improve
Message), where an operator remains in the loop for every message. Design
rationale and open questions live in
`plans/ai-database-connection-feature.md`; this document is the shipped
architecture recap and index into the feature's own `docs/` folders.

## Core correctness property

> **When in doubt, escalate — never fabricate.**

The model may only state facts returned by a tool in the current conversation.
Grounding plus an explicit `escalateToHuman` tool jointly force this: the
model's only sanctioned move when the data isn't there is to escalate, never
guess. A turn always ends in either a grounded reply or a clean handoff — there
is never dead air.

## Architecture recap

### `DataTool` abstraction (`apps/hono-api/src/features/ai-data/`)

Admin-configured, strictly read-only capabilities the AI can call. The model
only ever sees a tool's `name` / `description` / `inputSchema` — the backing
(an HTTP `GET` or a SQL `SELECT`) is server-side and never exposed, which is
what makes read-only true **by construction**:

- **HTTP backing** — hard-coded `GET`, host-allowlisted, DNS-resolved and
  checked against private/reserved IP ranges (SSRF guard), no redirects
  followed, 5s timeout, 256 KB response cap.
- **SQL backing** — a single stored query run inside a
  `BEGIN TRANSACTION READ ONLY` block, so Postgres rejects any write at runtime
  (SQLSTATE 25006); that transaction, not the keyword lint, is the read-only
  guarantee. A cheap `validateSqlQuery` keyword filter still rejects obvious
  write/DDL at save time and again at execution time. Positional `$1..$n` params
  bound from validated inputs, forced `LIMIT` if absent, per-application `pg`
  pool (max 2 connections, FIFO-evicted beyond 20 pools).
- **Errors are returned, never thrown** (`{ ok: false, error, kind }`), so a
  tool failure feeds the escalation policy instead of surfacing as an
  exception or a fabricated answer.

Admin CRUD (data source + tool catalog, test-before-enable, write-only
secrets) is documented in
`apps/hono-api/src/features/ai-data/docs/data-tool-management.md`; the
executor internals (SSRF guard, SQL validation, param binding) in
`apps/hono-api/src/features/ai-data/docs/data-tool-executors.md`. Admin UI in
`apps/admin/src/features/dataTools/docs/data-tools-ui.md`.

### `runAiTurn` (`apps/hono-api/src/features/ai-turn/`)

The runtime seam that owns an entire AI turn: load context → check
entitlement/quota → detect a pre-LLM human request → assemble tools
(`escalateToHuman` always + permitted data tools) → call the provider with a
tool loop (`maxSteps=5`) → reply or escalate. It never throws — every failure
path resolves to an escalation. One in-memory lock per conversation guarantees
a single in-flight turn; the function is a single self-contained unit designed
to become a BullMQ job handler with zero rework once Redis lands. Full flow
diagram and lock/entitlement/quota details:
`apps/hono-api/src/features/ai-turn/docs/autonomous-ai-turn.md`.

## Escalation policy

| Trigger                                | How it's detected                                                                                                                       | Kind              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| AI lacks the knowledge to answer       | Model calls `escalateToHuman({ reason })`                                                                                               | `knowledge_gap`   |
| A tool returns empty / error / no data | Grounding rule → model calls `escalateToHuman`                                                                                          | `knowledge_gap`   |
| Model produces no usable final text    | Empty final text, no tool escalation → reason `no_answer`                                                                               | `knowledge_gap`   |
| Visitor asks for a human               | Deterministic regex on the latest visitor message (pre-LLM), or the widget's persistent "Talk to a human" button / SDK `requestHuman()` | `human_requested` |
| The turn fails                         | LLM error / tool executor error / timeout / step budget spent                                                                           | `turn_failed`     |
| Monthly AI quota exhausted             | `checkAiQuota` denies before the LLM call                                                                                               | `quota_exhausted` |

Escalation flips the conversation back to `handledBy='human'`, `status='pending'`,
`assignedTo=null`, persists a visitor-facing system message, broadcasts
`conversation:escalated` to staff (same real-time path as `conversation:new`),
and fires a non-blocking, failure-tolerant AI handoff summary (quota-excluded)
so the accepting operator has context. An operator takes over with the same
`accept` action used for any human chat — there's no separate "take over from
AI" endpoint. Widget-side disclosure and the "Talk to a human" button are in
`packages/sdk/src/docs/ai-disclosure-and-escalation.md`.

## Add-on billing & gating matrix

The autonomous assistant is sold as a **purchasable add-on**
(`STRIPE_AI_ADDON_PRICE_KEY`, R$ 120/mo BRL with a US$ 24 currency option), decoupled from plan tier, modeled as a
second subscription item on the existing subscription (never a second
subscription). Entitlement (`aiAddonActive`) is derived only from Stripe
webhooks, never set directly by any route. Full billing mechanics:
`packages/docs/billing-and-plans/stripe-plan.md` ("AI Add-on" section).

| Capability                                            | Requires                                                                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Purchase the add-on                                   | `plan ∈ {PREMIUM, ENTERPRISE}`, `planStatus ∈ {active, trialing}`                                                          |
| Autonomous replies in the widget (`isAiTurnEntitled`) | `plan ∈ {PREMIUM, ENTERPRISE}` **and** `aiAddonActive` **and** `application.aiEnabled` **and** `application.aiAutoRespond` |
| HTTP data tools                                       | Org add-on entitlement **and** `application.aiEnabled`                                                                     |
| SQL data tools                                        | Org add-on entitlement **and** `application.aiEnabled` **and** `application.aiDbEnabled` (per-app opt-in)                  |
| Data-connection config UI (`requireAiAddon`)          | Org add-on entitlement (`plan ∈ {PREMIUM, ENTERPRISE}` **and** `aiAddonActive`) — same gate as the rest of the AI feature  |

A downgrade away from `{PREMIUM, ENTERPRISE}` clears the entitlement flags
immediately and schedules removal of the orphaned Stripe subscription item.

## Encryption

Any secret a `DataSource` needs — HTTP headers or a SQL connection string — is
encrypted at rest with **AES-256-GCM** (`secretBox.encryptSecret` /
`decryptSecret`) before storage. Secrets are decrypted only in-memory, per
request; admin API responses never return them (only booleans like
`hasHeaders` / `hasConnectionString`, and header _names_ for HTTP); and
decrypted values are never logged.

## Message authorship & widget UX

`messages.authorType` (`visitor | operator | ai | system`) discriminates the
sender; only `visitor` messages trigger a turn. The widget renders `ai`
messages with a distinct avatar/label, shows an AI disclosure line on first
contact, and keeps a persistent "Talk to a human" button in the header at all
times. Full widget-side contract:
`packages/sdk/src/docs/ai-disclosure-and-escalation.md`.

## Public-facing documentation

End-user / admin-facing docs (overview, eligibility & pricing, configuration
guide, escalation behavior, security & privacy) are published at
`apps/docs/src/content/v1/ai-assistant/` — distinct from this internal
architecture recap.

## See also

- `apps/hono-api/src/features/ai-turn/docs/autonomous-ai-turn.md` — full turn
  flow, lock semantics, entitlement resolution, two escalation entry points.
- `apps/hono-api/src/features/ai-data/docs/data-tool-executors.md` — SSRF
  guard, SQL validation, connection pooling.
- `apps/hono-api/src/features/ai-data/docs/data-tool-management.md` — admin
  CRUD, redaction shapes, test-before-enable.
- `apps/admin/src/features/dataTools/docs/data-tools-ui.md` — admin dashboard
  implementation.
- `packages/sdk/src/docs/ai-disclosure-and-escalation.md` — widget disclosure,
  typing indicator, "Talk to a human" button, takeover announcement.
- `packages/docs/billing-and-plans/stripe-plan.md` — AI add-on billing
  mechanics (item model, webhooks, purchase/cancel routes, downgrade
  revocation).
- `plans/ai-database-connection-feature.md` — original design decisions.
