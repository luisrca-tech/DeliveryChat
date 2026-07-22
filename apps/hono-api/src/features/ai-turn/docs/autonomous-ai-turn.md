# Autonomous AI Turn (`features/ai-turn`)

The autonomous AI turn lets an AI assistant answer a visitor directly in the chat
widget, reading tenant data through admin-configured tools, and **escalating to a
human whenever it cannot help or the visitor asks for one**. It is the runtime
half of the "AI Database Connection & Human Escalation" feature (plan §6–§7).

## Core correctness property

> **When in doubt, escalate — never fabricate.**

A turn ends in an escalation-to-human whenever ANY of these hold — there is never
dead air:

| Trigger                                | How it's detected                                             | Kind              |
| -------------------------------------- | ------------------------------------------------------------- | ----------------- |
| AI lacks the knowledge to answer       | Model calls `escalateToHuman({ reason })`                     | `knowledge_gap`   |
| A tool returns empty / error / no data | Grounding rule → model calls `escalateToHuman`                | `knowledge_gap`   |
| Model produces no usable final text    | Empty final text with no tool escalation → reason `no_answer` | `knowledge_gap`   |
| Visitor asks for a human               | Deterministic regex on the latest visitor message (pre-LLM)   | `human_requested` |
| The turn fails                         | LLM error / tool executor error / timeout / step budget spent | `turn_failed`     |
| Monthly AI quota exhausted             | `checkAiQuota` denies before the LLM call                     | `quota_exhausted` |

Grounding + the explicit `escalateToHuman` tool jointly force the auto-flip: the
model may only state facts returned by a tool in this conversation, so its only
sanctioned move when the data isn't there is to escalate. This is test-proven
(`__tests__/runAiTurn.test.ts`: empty tool result → escalation, not a fabricated
answer).

## Turn flow

```
Visitor message persisted (chat.service.sendMessage, authorType='visitor')
   └─ maybeTriggerAiTurn(conversationId)            [trigger.ts]
        └─ cheap check: handledBy='ai' & unassigned & not closed
             └─ void runAiTurn(conversationId)      [fire-and-forget]

runAiTurn(conversationId):                          [runAiTurn.ts]
  1. acquire per-conversation lock  (else return — debounce)
  2. loadTurnContext → conversation + org + application
  3. bail silently unless: handledBy='ai' & assignedTo=null & status≠closed
                           & entitlement holds (isAiTurnEntitled)
  4. checkAiQuota → if denied, escalate(quota_exhausted)
  5. load last N messages; if latest visitor msg is a human-request → escalate(human_requested)  [skips LLM]
  6. broadcast "AI is typing…" to the room
  7. assembleTools: escalateToHuman (always) + permitted data tools
  8. buildAutonomousSystemPrompt (guardrails + grounding + escalation + identity)
  9. runAICall(action='autonomous_reply') → provider.generateWithTools (SDK tool loop, maxSteps=5)
 10. outcome:
       • escalation flag set  → escalate(knowledge_gap, reason from tool)
       • empty final text     → escalate(knowledge_gap, 'no_answer')
       • normal text          → sanitize → sendMessage(authorType='ai', senderId=null) → broadcast
       • provider threw        → escalate(turn_failed)
       • ANY other throw       → escalate(turn_failed); if that also fails, log loudly
 11. finally: stop typing indicator; release lock
```

## Escalation (`escalate.ts`)

`escalateConversation` rides the existing conversation lifecycle:

1. `conversations` → `handledBy='human'`, `status='pending'`, `assignedTo=null`,
   `escalatedAt=now`, `escalationReason=reason` (truncated to 500).
2. Persists a visitor-facing system message (`type='system'`,
   `authorType='system'`) with the copy from `messages.ts`.
3. Broadcasts that system message to the conversation room.
4. Broadcasts a new **`conversation:escalated`** event to staff via
   `broadcastStaffEvent` — lands in the operator queue in real time, exactly like
   `conversation:new`.

Visitor-facing copy (`messages.ts`):

- **knowledge_gap / turn_failed / quota_exhausted:** _"I wasn't able to fully
  answer that, so I'm connecting you with someone from our team. You're in the
  queue — an operator will be with you shortly."_
- **human_requested:** _"Sure — connecting you with a team member now. You're in
  the queue; someone will join shortly."_

## Tool assembly & gating (`tools.ts`)

- `escalateToHuman({ reason })` is **always** present; its `execute` records the
  escalation intent on a turn-scoped context object and returns
  `{ acknowledged: true }`.
- Each enabled `applicationDataTool` becomes an `AIProviderTool`: a flat Zod
  schema built from the stored JSON Schema, `execute` calls
  `executeDataTool(...)`. A failed result (`ok:false`) is returned to the model
  as `{ error }` — **never thrown** — so the model follows the grounding rule and
  escalates.
- **HTTP tools** require org add-on entitlement + `application.aiEnabled`
  (already verified before the turn runs).
- **SQL tools** share the **same** org add-on entitlement as HTTP tools and
  additionally require the per-application `application.aiDbEnabled` opt-in.
  There is no ENTERPRISE-custom / `tenantRateLimits.isCustom` distinction.

## Entitlement (`entitlement.ts`)

`isAiTurnEntitled` is the single source of truth for the full 4-condition check,
used both at conversation creation (`resolveInitialHandledBy`) and per turn: plan
∈ {PREMIUM, ENTERPRISE} **and** `aiAddonActive` **and** `application.aiEnabled`
**and** `application.aiAutoRespond`.

Its org half (plan eligible **and** `aiAddonActive`) is delegated to the shared
`isAddonEntitled` seam in **`features/ai/entitlement.ts`** — the one module that
owns the eligible-plan list and the Stripe add-on derivation. The same seam backs
`requireAiAddon()` (the AI/data-tools middleware gate), the billing purchase
gate (`addonEligiblePlan`), and the subscription webhooks
(`deriveAddonEntitlement`), so the `{PREMIUM, ENTERPRISE}` rule exists in exactly
one place.

## Lock semantics (`lock.ts`)

An in-memory `Set<conversationId>` guarantees **one turn per conversation at a
time**. A second concurrent `runAiTurn` for the same conversation returns
immediately (debounce) — the running turn always reads the latest messages, so a
dropped call loses nothing. The lock is always released in `finally`.

## BullMQ-readiness

`runAiTurn(conversationId)` is a single self-contained seam: it owns loading,
the escalation policy, and all error handling, and it never throws. Today it is
called in-process as a non-awaited task from `sendMessage`. When BullMQ/Redis
lands (per the roadmap: HTTP → WS → Redis → BullMQ), `runAiTurn` becomes the job
handler with **zero rework** in the caller, and the in-memory lock becomes a
Redis lock.

## Two escalation entry points

Escalation to a human is triggered from exactly two places, both funnelling
through the single `escalateConversation` seam (`escalate.ts`):

1. **AI-initiated (autonomous):** inside `runAiTurn` — knowledge gap, empty
   answer, turn failure, quota exhaustion, or the pre-LLM human-request regex.
2. **Visitor-initiated (deterministic "Talk to a human", AC #4):**
   `POST /conversations/:id/escalate` (`routes/conversations/escalation.ts`).
   Mirrors the visitor auth of the messaging routes (`requireAuth()` + a
   participant check for visitors; staff are org-scoped instead). Semantics:

   | Conversation state          | Result                                                                                                                                           |
   | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
   | AI-handled, open            | `escalateConversation(kind='human_requested')` — identical system message + `conversation:escalated` broadcast + `handledBy` flip as the AI path |
   | Already human-handled, open | Idempotent no-op success (already with / queued for a human)                                                                                     |
   | Closed                      | `409 Conflict`                                                                                                                                   |
   | Visitor not a participant   | `404 Not Found`                                                                                                                                  |

   Responds with the updated conversation snapshot, like the sibling lifecycle
   endpoints.

   > **WS variant — deliberately skipped.** Escalation is a rare, single,
   > deterministic action best modelled as a REST call (the persistent "Talk to
   > a human" button), matching `accept`/`leave`/`resolve` which are all REST.
   > The WS channel is reserved for high-frequency messaging (`message:send`).
   > No `conversation:escalate` client event was added.

## Operator takeover — stopping the AI (AC #5)

An operator takes over an AI-driven chat with the **same `accept` action** used
for human chats — there is no separate "take over" endpoint.

`acceptConversation` (`chat.service.ts`) now flips `handledBy → 'human'` inside
the **same race-safe UPDATE** (`WHERE status='pending' AND assignedTo IS NULL`),
alongside `assignedTo` and `status='active'`. Because AI-handled conversations
run as **`status='pending'` throughout** — creation leaves them pending, AI turns
only send messages (never accept), and escalation resets them to pending — this
one guard covers takeover of **both** an escalated chat **and** a still-healthy
AI chat an operator grabs mid-flow. A lost race never half-flips.

Once `handledBy='human'`, any re-triggered turn no-ops on the existing guard
(`handledBy !== 'ai'`), so a visitor message still in flight cannot produce a
double-reply. Proven by `chat.service.test` (the flip) + `runAiTurn.test` (the
post-accept no-op).

## Handoff summary — context on takeover (AC #5)

On **every** escalation, `escalateConversation` fires a **non-blocking,
failure-tolerant** `generateHandoffSummary(conversation)` (`handoffSummary.ts`,
lazily imported, never awaited). It produces a short operator briefing and
persists it to the new **`conversations.handoffSummary`** text column.

- **Escalation never fails because the summary failed** — the generator wraps
  everything in try/catch and never throws; the DB flip is the source of truth.
- Uses `runAICall(action='handoff_summary')`, a **quota-excluded** action
  (`QUOTA_EXCLUDED_ACTIONS`) — a handoff briefing must not consume the tenant's
  monthly AI cap.
- **No new broadcast event.** The summary is surfaced lazily: the operator opens
  the conversation and the conversations GET/detail serializer
  (`getConversationWithParticipants`, a full-row select) returns `handoffSummary`
  along with `handledBy`, `escalatedAt`, and `escalationReason`. The staff list
  (`listConversationsForMember`, also a full-row select) carries them too. The
  visitor list intentionally omits these staff-only fields.

## Message authorship

`messages.authorType` (`visitor | operator | ai | system`) discriminates the
sender. Only `visitor` messages trigger a turn. The AI's reply is persisted with
`authorType='ai'` and `senderId=null`; the escalation system message with
`authorType='system'`.
