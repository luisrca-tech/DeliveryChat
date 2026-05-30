# Interview Module Boundaries

Map of the modules that make up the AI interview backend after the Phase 2b
state-machine merge, and where to add new behavior.

## Module map

| Module | Responsibility | Allowed dependencies |
|--------|----------------|----------------------|
| `ai.interview.stateMachine.ts` | `InterviewStateMachine`: the sole owner of interview turn rules, decision dispatch, persistence, and provider invocation via the orchestrator. Exposes a narrow public surface (`getInterviewContext`, `runInterviewTurn`, `runInterviewComplete`, `runGenerateSummary`). Internal `TurnDecision` / `EngineNextInput` types do not leak past this module boundary. | `ai.callOrchestrator`, `ai.summaryGenerator`, `ai.interview.guardRails`, `ai.interview.schema`, `ai.prompts.interview`, `ai.providerPort`, `ai.sanitize`, `ai.errors`, Drizzle, `db/schema/*` |
| `ai.interview.guardRails.ts` | `Record<GuardRailAction, GuardRailRules>` with `{ advanceTurn, persistMarker?, suppressFinishReprompt }`. | none |
| `ai.interview.schema.ts` | `interviewerOutputSchema` Zod contract, `CORE_TOPICS`, `MAX_TURNS`, log-entry shapes, `summaryStatus` derivation, `FORCED_COMPLETION_FINISH_REASON`. | `zod` |
| `ai.prompts.interview.ts` | `INTERVIEWER_SYSTEM_PROMPT` and `INTERVIEW_MODEL` constants. | none |
| `ai.callOrchestrator.ts` | Sole writer to `aiUsageLog`. Owns retry policy, parse, sanitisation, log, and error mapping for every AI call. Joins the caller's transaction, never opens one. | `ai.providerPort`, `ai.errors`, `ai.errorMapper`, `db/schema/aiUsageLog` |
| `ai.summaryGenerator.ts` | Builds the summary user message, invokes the provider via the orchestrator, validates the parsed markdown. Stateless. | `ai.callOrchestrator`, `ai.providerPort`, `ai.sanitize`, `ai.errors` |
| `ai.errors.ts` | Domain errors: `MissingTopicsError`, `TurnConflictError`, `SummaryGenerationFailedError`, AI provider/timeout/rate-limit/safety classes. | none |
| `ai.errorMapper.ts` | Error → HTTP envelope mapping (unchanged wire format). | `ai.errors`, HTTP helpers |
| `routes/applications/ai-interview/index.ts` | Thin HTTP adapter: auth + tenant resolution + body parsing + dispatch to the state machine. Contains no DB writes and no business rules. | state machine, route helpers, middleware |

### Read port

`InterviewReadPort` (also exported from `ai.interview.stateMachine.ts`) is a
read-only repository surface — only `loadByApplicationId(applicationId)`. It
exists so future read sites (admin lists, derived projections) can depend on a
query API without growing write coupling. The state machine performs all writes
inline via the orchestrator's `DbExecutor`, not through the read port.

## Data flow

```
POST /applications/:id/ai-interview/turns
  → requireTenantAuth → requireRole('admin') → checkBillingStatus → requireAiFeature('interview')
  → stateMachine.runInterviewTurn()
      db.transaction(tx => {
        const row = await loadOrInit(tx, applicationId)       // applicationAiContext I/O
        // optimistic-lock check + force-cap dispatch
        const decision = await runAICall({
          action: 'interview',
          providerCall: () => decideNext(row, llmOutput),
        })                                                    // provider + aiUsageLog write
        const updated = await writeBootstrap | writeAdvance(tx, ...)
        return { row: updated, output, canFinish }
      })
  → route returns response envelope
```

`runInterviewComplete` and `runGenerateSummary` follow the same shape — open a
transaction (or, for the summary read+write, read outside then commit inside),
delegate to the orchestrator for any provider call, and persist via the inline
`write*` helpers.

## Where to add new behavior

### A new guard-rail action

1. Add the action key to the `GuardRailAction` union in `ai.interview.schema.ts`
   (and to `interviewerOutputSchema.guardrailAction` enum so the LLM can emit it).
2. Add a row in the `GUARD_RAIL_RULES` table in `ai.interview.guardRails.ts`
   declaring `{ advanceTurn, persistMarker?, suppressFinishReprompt }`. Do not
   add an `if/else` branch in the state machine — it reads the table.
3. If the action persists a marker on the log entry, extend the log-entry shape
   in `ai.interview.schema.ts` accordingly.
4. Add a lifecycle test in `ai.interview.stateMachine.test.ts` covering the
   new outcome.
5. Update the prompt in `ai.prompts.interview.ts` so the LLM knows when to emit
   the new action.

### A new turn rule (e.g., a different cap, a new override path)

1. Encode the rule inside the private `decideNext` / `decideComplete` functions
   in `ai.interview.stateMachine.ts`. Anything that touches turn numbers, intents,
   or termination conditions belongs in the state machine — never in the route.
2. If new state needs to be persisted, add it to the matching `write*` helper
   and the decision type. Do not reach for the database outside the state
   machine module.
3. Add a lifecycle test that drives the rule end-to-end through the public
   `runInterview*` entry points.

### A new LLM-backed AI action

1. Implement the parse / provider call closure for the new action.
2. Call it through `runAICall({ action, providerCall, parse })` so it gets free
   `aiUsageLog` writes and unified error mapping. Do not re-implement the
   usage-log insert or the error mapper switch.
3. Add the action key to the `AiCallAction` union and decide whether it counts
   against the monthly quota (`QUOTA_EXCLUDED_ACTIONS` in `ai.quota.ts`).

## Invariants

- The route has zero interview business rules: no bootstrap detection, no
  guard-rail branching, no turn-cap math.
- The state machine is the only module that writes to `applicationAiContext`.
- `runAICall` is the only module that writes to `aiUsageLog` — verified by grep.
- `runAICall` joins the caller's `tx` — it never opens transactions.
- Forced completion vs voluntary completion remain distinguishable in
  `aiUsageLog` via `finishReason='forced_cap_completion'`.
- Internal `TurnDecision` / `EngineNextInput` types are not exported.
- HTTP wire format (`ai.errorMapper.ts`) is unchanged from before the refactor.

## Related

- Engine reference: [`interview-engine.md`](./interview-engine.md)
- Admin UX: [`packages/docs/ai-interview.md`](../../../../../../packages/docs/ai-interview.md)
