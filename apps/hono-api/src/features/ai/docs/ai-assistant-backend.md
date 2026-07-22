# AI Assistant — Backend

## Overview

The AI assistant feature enables operators on PREMIUM and ENTERPRISE plans to use an LLM (via OpenRouter gateway) for two actions: **Generate Reply** (draft a new reply from conversation context) and **Improve Message** (rewrite an operator's existing draft for clarity and professionalism).

## Routes

### `POST /api/v1/ai/generate-reply`

Generates a new reply suggestion based on conversation history.

- Request: `{ "conversationId": "uuid" }`
- Response: `{ "text": "Suggested reply content" }`
- Context: Last N messages (configurable via `AI_CONTEXT_MESSAGE_LIMIT`, default 10)

### `POST /api/v1/ai/improve-message`

Rewrites an operator's draft message for better clarity, tone, and professionalism.

- Request: `{ "conversationId": "uuid", "draft": "operator's text (1-4000 chars)" }`
- Response: `{ "text": "Improved message content" }`
- Context: Last 3 messages (fixed) + operator's draft
- The system prompt instructs the model to rewrite (not reply), preserving the original intent and language

### Middleware Chain

1. `requireTenantAuth()` — session-based auth
2. `requireRole("operator")` — minimum operator role
3. `checkBillingStatus()` — billing gate
4. `requireAiFeature()` — plan gate + monthly cap check
5. `createAiRateLimitMiddleware()` — 10 RPM, 250 RPD per tenant

## Provider Abstraction

- `AIProvider` interface with `generateText()` method
- `OpenRouterProvider` — production, uses Vercel AI SDK + `@openrouter/ai-sdk-provider`
- `MockProvider` — tests, activated by `mock://` model identifier. Supports simulation flags in system prompt: `__TIMEOUT__`, `__EMPTY__`, `__CONTENT_FILTER__`, `__PROVIDER_ERROR__`

## Context Building

Messages are formatted as `[Customer/Operator, Xmin ago] content`. Last N messages (configurable via `AI_CONTEXT_MESSAGE_LIMIT` env var, default 10) are fetched in chronological order.

### Lexical-Aware Context

Both `generateReply` and `improveMessage` select `contentFormat` alongside `content` from the database. Before building context, each message is run through `serializeLexicalToPlainText()`:

- `contentFormat: 'plain'` — content passed through as-is
- `contentFormat: 'lexical'` — Lexical JSON is parsed and only the text content is extracted (formatting, node types, and structure are stripped)
- Malformed Lexical JSON — falls back to a truncated plain text excerpt (max 500 chars)

Raw Lexical JSON is never sent to the LLM.

### AI Output Format — Constrained Markdown

Both system and improve prompts instruct the model to use only a restricted Markdown subset:

| Construct     | Syntax                              |
| ------------- | ----------------------------------- |
| Bold          | `**text**`                          |
| Heading H1    | `# Heading`                         |
| Heading H2    | `## Heading`                        |
| Heading H3    | `### Heading`                       |
| Bullet list   | `- item` or `* item`                |
| Numbered list | `1. item`                           |
| Paragraphs    | Plain text separated by blank lines |

**Excluded from AI output:** links, images, code blocks, inline code, italic, underline, blockquotes, HTML tags, tables, H4+.

The improve prompt additionally instructs the model to preserve the draft's structure level (e.g., don't add headings to a one-line reply).

### Response Sanitization — `sanitizeAiMarkdown()`

After every successful provider response, `sanitizeAiMarkdown()` is applied before returning `{ text }`:

- Strips HTML tags (including script/style content)
- Removes fenced code blocks (` ``` `) but keeps inner text
- Strips inline code backticks
- Converts link syntax `[text](url)` to just `text`
- Preserves all allowed Markdown constructs

The API response shape remains `{ text: string }` — no breaking changes. The `text` field contains Markdown (not HTML or Lexical JSON).

## Error Handling

| Error                 | HTTP Code | Error Code                 |
| --------------------- | --------- | -------------------------- |
| Timeout               | 504       | `ai_timeout`               |
| Provider rate limit   | 503       | `ai_provider_busy`         |
| Provider unavailable  | 502       | `ai_provider_unavailable`  |
| Empty response        | 422       | `ai_empty_response`        |
| Content filtered      | 422       | `ai_content_filtered`      |
| Monthly cap exceeded  | 403       | `ai_monthly_cap_exceeded`  |
| Feature not available | 403       | `ai_feature_not_available` |
| AI rate limit         | 429       | `ai_rate_limit_exceeded`   |

## Retry Policy

One retry with ~1s backoff on transient `AIProviderError` (including `AITimeoutError`, which extends `AIProviderError`). Never retries: provider rate limit, content filter, empty response, abort, quota errors.

## Usage Logging

Every call that reaches the provider logs one `aiUsageLog` row. Only `success`, `empty`, and `content_filtered` statuses count against the monthly cap. Provider errors, timeouts, and aborts do not consume quota.

## Plan Gating

| Plan       | AI Enabled | Monthly Cap                                                     |
| ---------- | ---------- | --------------------------------------------------------------- |
| FREE       | No         | 0                                                               |
| BASIC      | No         | 0                                                               |
| PREMIUM    | Yes        | 3,000                                                           |
| ENTERPRISE | Yes        | 3,000 (overridable via `tenantRateLimits.aiMonthlyCapOverride`) |

## E2E Tests

E2E tests live in `apps/hono-api/e2e/ai.e2e.ts` and run against a live server with `AI_MODEL=mock://test`.

### Running

```bash
# Start server with mock provider
AI_MODEL=mock://test infisical run --path=/hono-api -- bun run dev --filter=hono-api

# In another terminal
infisical run --path=/hono-api -- npx playwright test e2e/ai.e2e.ts
```

### Coverage

- Generate Reply happy path (conversation with messages)
- Generate Reply with empty conversation history
- Improve Message happy path
- Improve Message at 4,000-char boundary (accepted) and 4,001-char (rejected)
- Empty/invalid draft rejection
- Plan gating: FREE plan → 403 `ai_feature_not_available`
- Billing gating: canceled subscription → 403
- Usage endpoint: admin access, operator blocked, filter/pagination support
