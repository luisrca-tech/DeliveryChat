# AI Assistant — Backend (Phase 1A)

## Overview

The AI assistant feature enables operators on PREMIUM and ENTERPRISE plans to generate reply suggestions using an LLM (Groq/Llama). The backend provides a single endpoint that receives a conversation ID, builds context from recent messages, calls the AI provider, and returns a suggested reply.

## Route

`POST /v1/ai/generate-reply`

### Request

```json
{ "conversationId": "uuid" }
```

### Response

```json
{ "text": "Suggested reply content" }
```

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
