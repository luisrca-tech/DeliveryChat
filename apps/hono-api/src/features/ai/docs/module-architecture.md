# AI Module Architecture

## Module Decomposition

The AI feature is split into focused modules, each with a single responsibility:

| Module                       | Responsibility                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai.callOrchestrator.ts`     | **Sole** writer to `aiUsageLog`. Owns retry policy, request execution, response parsing/sanitisation hook, content-filter detection, error classification, and best-effort usage logging. Single typed entry point: `runAICall<TRaw, TParsed>(params)`. Joins the caller's transaction when `tx` is passed. |
| `ai.providerPort.ts`         | `AIProviderPort` interface + request/response types. Defines the boundary tests inject against. No SDK imports.                                                                                                                                                                                             |
| `ai.openRouterProvider.ts`   | `OpenRouterProvider` (OpenRouter SDK) + `createAIProvider(model, apiKey)` factory. The only file that imports `@openrouter/ai-sdk-provider`.                                                                                                                                                              |
| `ai.mockProvider.ts`         | `MockProvider` (in-memory fake) for tests and `mock://*` models.                                                                                                                                                                                                                                            |
| `ai.interview.engine.ts`     | Pure `InterviewTurnEngine` — `next` / `complete` returning `TurnDecision`                                                                                                                                                                                                                                   |
| `ai.interview.guardRails.ts` | Guard-rail strategy table                                                                                                                                                                                                                                                                                   |
| `ai.interview.repository.ts` | `applicationAiContext` reads/writes and optimistic-lock check                                                                                                                                                                                                                                               |
| `ai.interview.schema.ts`     | `interviewerOutputSchema`, `CORE_TOPICS`, `MAX_TURNS`                                                                                                                                                                                                                                                       |
| `ai.interview.service.ts`    | Interview orchestration (transaction + orchestrator + engine + repo)                                                                                                                                                                                                                                        |
| `ai.summaryGenerator.ts`     | Interview-summary LLM call (delegates to orchestrator with `action: "interview_summary"`)                                                                                                                                                                                                                   |
| `ai.prompts.interview.ts`    | Interview system prompt and model constant                                                                                                                                                                                                                                                                  |
| `ai.quota.ts`                | Monthly quota check (plan limits + tenant overrides + usage counting). `QUOTA_EXCLUDED_ACTIONS` skips `interview`, `interview_summary`, and `interview_forced_completion`.                                                                                                                                  |
| `ai.rateLimit.ts`            | Per-tenant sliding window rate limiting with pluggable store interface                                                                                                                                                                                                                                      |
| `ai.service.ts`              | Business logic orchestration for `generate` / `improve` (ownership, messages, context, delegation to orchestrator)                                                                                                                                                                                          |
| `ai.context.ts`              | Prompt composition (guard rails, action instructions, application context)                                                                                                                                                                                                                                  |
| `ai.middleware.ts`           | Thin HTTP middleware wrappers for quota and rate limiting                                                                                                                                                                                                                                                   |
| `ai.errors.ts`               | Domain-specific error types                                                                                                                                                                                                                                                                                 |
| `ai.errorMapper.ts`          | Error → HTTP response mapping                                                                                                                                                                                                                                                                               |
| `ai.sanitize.ts`             | Markdown output sanitization                                                                                                                                                                                                                                                                                |
| `ai.schemas.ts`              | Zod validation schemas                                                                                                                                                                                                                                                                                      |

## Data Flow

```
POST /ai/generate-reply
  → Middleware: requireAiFeature() → checkAiQuota()
  → Middleware: createAiRateLimitMiddleware() → RateLimitStore.check()
  → Service: generateReply()
    → verifyConversationOwnership() → returns applicationId
    → [parallel] fetchMessages() + getCompletedContextSummary(applicationId)
    → buildSystemPrompt({ action, tenantName, contextSummary })
    → runAICall({ action: "generate", providerCall, parse, ... })
      → retry loop (max 2 attempts, 1s delay; rate-limit errors are not retried)
      → on content-filter finishReason → log status "content_filtered", throw AIContentFilteredError
      → parse() may throw AIEmptyResponseError → log status "empty"
      → on success → log status "success" via aiUsageLog
      → AbortError → log status "aborted"; other errors → log "timeout" or "provider_error"
  → Response: { text }
```

## Key Design Decisions

### Single Orchestrator (`ai.callOrchestrator.ts`)

The orchestrator collapses what used to be three layers (`callRunner` → `executor` → `provider`) into one module with a single entry point. All callers — `generateReply`, `improveMessage`, the interviewer's LLM turn, forced completion logging, and `interview_summary` — flow through `runAICall`. This makes `aiUsageLog` writes auditable by grep (`grep aiUsageLog` returns exactly one writer outside the read-only `ai.service.getAiUsageLogs` query and the `ai.quota` counter).

Forced completion does not call the provider, but still produces a schema-identical usage row by passing a synthetic `providerCall` closure that returns a canned outcome with `finishReason: "forced_completion"` and `action: "interview_forced_completion"`. Keeping it on the single entry point means the policy (logging, error mapping, retry) cannot drift between "real" and "synthetic" calls.

### Provider Port (`ai.providerPort.ts`)

The OpenRouter SDK is hidden behind the `AIProviderPort` interface. Tests construct a `FakeProvider` (any object implementing the interface) and inject it into closures passed to `runAICall`. There is no monkey-patching of network code. The OpenRouter impl lives in `ai.openRouterProvider.ts` and is the only file with an `@openrouter/ai-sdk-provider` import.

### Quota as Pure Function (`ai.quota.ts`)

`checkAiQuota(tenantId, plan)` returns `{ allowed: true } | { allowed: false, reason }`. Separates the decision from HTTP concerns. `QUOTA_EXCLUDED_ACTIONS` ensures interview-related actions (including the synthetic `interview_forced_completion`) do not count against the monthly cap.

### Rate Limit Store Interface (`ai.rateLimit.ts`)

`RateLimitStore` interface with `check(key)` and `increment(key)` methods. `InMemoryRateLimitStore` is the current implementation. The interface enables future Redis or DB-backed implementations for multi-instance deployments.

### Application Context Wiring

`requireApplicationAiContext(applicationId)` fetches the context summary from `applicationAiContext` when the application has `aiEnabled: true` and a completed interview. The summary is passed to `buildSystemPrompt()` which appends it as an `[Application Context]` block.

## OpenRouter Gateway

All AI provider calls route through OpenRouter via the Vercel AI SDK (`@openrouter/ai-sdk-provider`). The gateway enables access to multiple upstream model providers with a unified API.

**Configuration:**
- `OPENROUTER_API_KEY` environment variable (required for production)
- `AI_MODEL` sets the model identifier (default: `nvidia/nemotron-3-super-120b-a12b:free` — used for all AI actions: autonomous turns, interviews, handoff summaries)
- Chat settings pass `provider: { require_parameters: true }` to restrict routing to providers supporting tool/response_format constraints

**Error semantics:**
- HTTP 429 (rate limit) — includes `Retry-After` header (seconds); classified as `AIProviderRateLimitError.retryAfterMs`. Only retried if ≤ 10s.
- HTTP 502 (model provider down) — classified as retryable `AIProviderError` (single retry after 1s)
- HTTP 503 (no provider meets routing requirements) — classified as retryable `AIProviderError` (single retry after 1s)
- OpenRouter does not stream responses in our implementation, so the known caveat of upstream errors embedded in 200 responses on streaming paths does not apply

**Free-tier rate caps:**
- 20 requests per minute (account-wide)
- 50 requests per day (account with < $10 lifetime credits)
- 1,000 requests per day (account with ≥ $10 lifetime credits)
