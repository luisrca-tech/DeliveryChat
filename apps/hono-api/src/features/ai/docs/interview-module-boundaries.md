# Interview Module Boundaries

Map of the modules that make up the AI interview backend after the architecture
refactor, and where to add new behavior.

## Module map

| Module | Responsibility | Allowed dependencies |
|--------|----------------|----------------------|
| `ai.interview.engine.ts` | Pure `InterviewTurnEngine`: `next(state, input)` and `complete(state, input)` return a `TurnDecision` discriminated union. Owns turn dispatch (bootstrap vs advance), guard-rail dispatch via the strategy table, turn-cap math, and final-question framing. | `ai.interview.schema`, `ai.interview.guardRails`, `ai.errors` |
| `ai.interview.guardRails.ts` | `Record<GuardRailAction, GuardRailRules>` with `{ advanceTurn, persistMarker?, suppressFinishReprompt }`. | none |
| `ai.interview.schema.ts` | `interviewerOutputSchema` Zod contract, `CORE_TOPICS`, `MAX_TURNS`, log-entry shapes, `FORCED_COMPLETION_FINISH_REASON`. | `zod` |
| `ai.prompts.interview.ts` | `INTERVIEWER_SYSTEM_PROMPT` and `INTERVIEW_MODEL` constants. | none |
| `ai.interview.repository.ts` | `InterviewRepository`: owns all `applicationAiContext` reads/writes, the optimistic-lock check, and persistence of `TurnDecision`s. Drizzle types do not leak past this boundary. | Drizzle, `db/schema/*`, `ai.interview.schema`, `ai.errors` |
| `ai.callRunner.ts` | Shared `runAiCall({ action, providerCall, parse })`. Wraps provider call + `aiUsageLog` write + `ai.errorMapper` translation. Joins the caller's transaction, never opens one. Used by `generateReply`, `improveMessage`, and the interviewer. | `ai.provider`, `ai.errorMapper`, `db/schema/aiUsageLog` |
| `ai.interview.service.ts` | Orchestration: opens `db.transaction(...)`, calls `repo.loadOrInit` → `runAiCall` → `engine.next`/`complete` → `repo.apply(decision)`. No business rules here — it's the glue. | `ai.callRunner`, `ai.interview.engine`, `ai.interview.repository`, `ai.prompts.interview` |
| `ai.errors.ts` | Domain errors: `MissingTopicsError`, `TurnConflictError`, etc. | none |
| `ai.errorMapper.ts` | Error → HTTP envelope mapping (unchanged wire format). | `ai.errors`, HTTP helpers |
| `routes/applications/ai-interview/index.ts` | Thin HTTP adapter: auth + tenant resolution + body parsing + dispatch to the service. ~120 lines, no interview business rules. | service, route helpers, middleware |

## Data flow

```
POST /applications/:id/ai-interview/turns
  → requireTenantAuth → requireRole('admin') → checkBillingStatus → requireAiFeature('interview')
  → service.runInterviewTurn()
      db.transaction(tx => {
        const state = await repo.loadOrInit(tx, ...)         // applicationAiContext I/O
        const output = await runAiCall({ action: 'interview', providerCall, parse })
                                                              // provider + aiUsageLog write
        const decision = engine.next(state, { output, ... })  // pure: TurnDecision
        const row = await repo.apply(tx, decision)            // persist + optimistic lock
        return { row, output, canFinish }
      })
  → route returns response envelope
```

The same shape applies to `runInterviewComplete`, which calls `engine.complete`
and `repo.markCompleted`.

## Where to add new behavior

### A new guard-rail action

1. Add the action key to the `GuardRailAction` union in `ai.interview.schema.ts`
   (and to `interviewerOutputSchema.guardrailAction` enum so the LLM can emit it).
2. Add a row in the `GUARD_RAIL_RULES` table in `ai.interview.guardRails.ts`
   declaring `{ advanceTurn, persistMarker?, suppressFinishReprompt }`. Do not
   add an `if/else` branch in the engine — the engine reads the table.
3. If the action persists a marker on the log entry, extend the log-entry shape
   in `ai.interview.schema.ts` accordingly.
4. Add a pure-unit test in `ai.interview.engine.test.ts` covering the
   `(advanceTurn, persistMarker, suppressFinishReprompt)` outcome.
5. Update the prompt in `ai.prompts.interview.ts` so the LLM knows when to emit
   the new action.

### A new turn rule (e.g., a different cap, a new override path)

1. Encode the rule inside `InterviewTurnEngine.next` / `complete`. Anything that
   touches turn numbers, intents, or termination conditions belongs in the
   engine — never in the service or route.
2. If new state needs to be persisted, add it to the `TurnDecision` union and
   handle it in `InterviewRepository.apply`. The engine should never reach for
   the database.
3. Add pure-unit tests for the rule. The engine has no I/O — these tests should
   not touch Drizzle or the provider.

### A new LLM-backed AI action (e.g., a new `generate*` flow)

1. Implement the parse / provider call closure for the new action.
2. Call it through `runAiCall({ action: '<new-action>', providerCall, parse })`
   so it gets free `aiUsageLog` writes and unified error mapping. Do not
   re-implement the usage-log insert or the error mapper switch.
3. Add the action key to the `aiUsageLog.action` enum / type and decide whether
   it counts against the monthly quota (`QUOTA_EXCLUDED_ACTIONS` in
   `ai.quota.ts`).
4. Wire the new action through `ai.middleware.ts` if it needs feature gating
   beyond the existing checks.

## Invariants

- The engine has zero imports from Drizzle, the provider SDK, or the route layer.
- The route has zero interview business rules: no `expectedCurrentTurn === 0 && message === ""` check, no guard-rail branching, no turn-cap math.
- `runAiCall` does not open transactions — it joins the caller's `tx`.
- Forced completion vs voluntary completion remain distinguishable in
  `aiUsageLog` via `finishReason='forced_cap_completion'`.
- HTTP wire format (`ai.errorMapper.ts`) is unchanged from before the refactor.
