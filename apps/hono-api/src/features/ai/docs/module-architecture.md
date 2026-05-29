# AI Module Architecture

## Module Decomposition

The AI feature is split into focused modules, each with a single responsibility:

| Module | Responsibility |
|--------|---------------|
| `ai.callRunner.ts` | Shared provider call + `aiUsageLog` write + `ai.errorMapper` translation. Joins the caller's transaction. Used by `generateReply`, `improveMessage`, and the interviewer. |
| `ai.executor.ts` | Retry loop, error classification, usage logging, and output sanitization (legacy reply/improve path) |
| `ai.interview.engine.ts` | Pure `InterviewTurnEngine` — `next` / `complete` returning `TurnDecision` |
| `ai.interview.guardRails.ts` | Guard-rail strategy table |
| `ai.interview.repository.ts` | `applicationAiContext` reads/writes and optimistic-lock check |
| `ai.interview.schema.ts` | `interviewerOutputSchema`, `CORE_TOPICS`, `MAX_TURNS` |
| `ai.interview.service.ts` | Interview orchestration (transaction + runner + engine + repo) |
| `ai.prompts.interview.ts` | Interview system prompt and model constant |
| `ai.quota.ts` | Monthly quota check (plan limits + tenant overrides + usage counting) |
| `ai.rateLimit.ts` | Per-tenant sliding window rate limiting with pluggable store interface |
| `ai.service.ts` | Business logic orchestration (ownership, messages, context, delegation to executor) |
| `ai.context.ts` | Prompt composition (guard rails, action instructions, application context) |
| `ai.middleware.ts` | Thin HTTP middleware wrappers for quota and rate limiting |
| `ai.provider.ts` | LLM provider abstraction (Groq + Mock implementations) |
| `ai.errors.ts` | Domain-specific error types |
| `ai.errorMapper.ts` | Error → HTTP response mapping |
| `ai.sanitize.ts` | Markdown output sanitization |
| `ai.schemas.ts` | Zod validation schemas |

## Data Flow

```
POST /ai/generate-reply
  → Middleware: requireAiFeature() → checkAiQuota()
  → Middleware: createAiRateLimitMiddleware() → RateLimitStore.check()
  → Service: generateReply()
    → verifyConversationOwnership() → returns applicationId
    → [parallel] fetchMessages() + getCompletedContextSummary(applicationId)
    → buildSystemPrompt({ action, tenantName, contextSummary })
    → executeAI({ provider, prompt, messages, ... })
      → retry loop (max 2 attempts)
      → logUsage() (best-effort)
      → sanitizeAiMarkdown()
  → Response: { text }
```

## Key Design Decisions

### Executor Pattern (`ai.executor.ts`)

The retry/logging/sanitization logic is shared between `generateReply` and `improveMessage` via `executeAI()`. This eliminated ~140 LOC of duplication and centralizes error classification and usage logging in one place. The executor is testable without DB mocks — only needs a mock `AIProvider`.

### Quota as Pure Function (`ai.quota.ts`)

`checkAiQuota(tenantId, plan)` returns `{ allowed: true } | { allowed: false, reason }`. This separates the decision logic from HTTP concerns, making it testable without Hono context. The middleware is a thin wrapper that maps the result to HTTP responses.

### Rate Limit Store Interface (`ai.rateLimit.ts`)

`RateLimitStore` interface with `check(key)` and `increment(key)` methods. `InMemoryRateLimitStore` is the current implementation. The interface enables future Redis or DB-backed implementations for multi-instance deployments. Tests construct their own store instance — no `_testGetRateLimitStore()` escape hatch needed.

### Application Context Wiring

`getCompletedContextSummary(applicationId)` fetches the context summary from `applicationAiContext` when the application has `aiEnabled: true` and a completed interview. Returns `undefined` otherwise. The summary is passed to `buildSystemPrompt()` which appends it as an `[Application Context]` block.
