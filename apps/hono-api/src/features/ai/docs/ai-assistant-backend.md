# AI Assistant — Backend

## Overview

The AI assistant feature enables operators on PREMIUM and ENTERPRISE plans to use an LLM (Groq/Llama) for two actions: **Generate Reply** (draft a new reply from conversation context) and **Improve Message** (rewrite an operator's existing draft for clarity and professionalism).

## Routes

### `POST /v1/ai/generate-reply`

Generates a new reply suggestion based on conversation history.

- Request: `{ "conversationId": "uuid" }`
- Response: `{ "text": "Suggested reply content" }`
- Context: Last N messages (configurable via `AI_CONTEXT_MESSAGE_LIMIT`, default 10)

### `POST /v1/ai/improve-message`

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
- `GroqProvider` — production, uses Vercel AI SDK + `@ai-sdk/groq`
- `MockProvider` — tests, activated by `mock://` model identifier. Supports simulation flags in system prompt: `__TIMEOUT__`, `__EMPTY__`, `__CONTENT_FILTER__`, `__PROVIDER_ERROR__`

## Context Building

Messages are formatted as `[Customer/Operator, Xmin ago] content`. Last N messages (configurable via `AI_CONTEXT_MESSAGE_LIMIT` env var, default 10) are fetched in chronological order.

## Error Handling

| Error | HTTP Code | Error Code |
|-------|-----------|------------|
| Timeout | 504 | `ai_timeout` |
| Provider rate limit | 503 | `ai_provider_busy` |
| Provider unavailable | 502 | `ai_provider_unavailable` |
| Empty response | 422 | `ai_empty_response` |
| Content filtered | 422 | `ai_content_filtered` |
| Monthly cap exceeded | 403 | `ai_monthly_cap_exceeded` |
| Feature not available | 403 | `ai_feature_not_available` |
| AI rate limit | 429 | `ai_rate_limit_exceeded` |

## Retry Policy

One retry with ~1s backoff on transient `AIProviderError`. Never retries: timeout, content filter, empty response, abort, quota errors.

## Usage Logging

Every call that reaches the provider logs one `aiUsageLog` row. Only `success`, `empty`, and `content_filtered` statuses count against the monthly cap. Provider errors, timeouts, and aborts do not consume quota.

## Plan Gating

| Plan | AI Enabled | Monthly Cap |
|------|-----------|-------------|
| FREE | No | 0 |
| BASIC | No | 0 |
| PREMIUM | Yes | 3,000 |
| ENTERPRISE | Yes | 3,000 (overridable via `tenantRateLimits.aiMonthlyCapOverride`) |
