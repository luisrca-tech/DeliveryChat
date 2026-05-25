# AI Assistant

## Overview

The AI Assistant helps operators respond to customer conversations faster by generating contextual reply suggestions. It uses a large language model (LLM) to analyze recent conversation history and produce a draft reply that matches the conversation's language and tone.

## Features

### Generate Reply

Operators can click the "Generate Reply" button (sparkles icon) in the chat input area to get an AI-generated reply suggestion.

**How it works:**

1. The AI reads the last N messages in the conversation (default: 10)
2. It generates a professional, helpful reply matching the customer's language
3. The suggestion appears in the input field with an "AI suggestion" indicator
4. The operator can edit, send, or discard the suggestion

**Constraints:**

- Available only on PREMIUM and ENTERPRISE plans
- Button is enabled only when the input field is empty
- Rate limits: 10 requests per minute, 250 per day (per tenant)
- Monthly cap: 3,000 requests per month (PREMIUM/ENTERPRISE default)

### Improve Message (Planned — Phase 2)

Operators will be able to rewrite their draft message using AI for better tone and clarity.

## Plan Availability

| Feature        | FREE | BASIC | PREMIUM | ENTERPRISE |
|---------------|------|-------|---------|------------|
| Generate Reply | No   | No    | Yes     | Yes        |
| Improve Message| No   | No    | Yes     | Yes        |
| Monthly Cap    | —    | —     | 3,000   | Custom     |

ENTERPRISE tenants can have custom monthly caps configured via tenant rate limit overrides.

## Privacy & Data

- No customer messages or AI-generated responses are stored beyond the conversation itself
- The `aiUsageLog` table records metadata only: timestamps, token counts, latency, status
- All AI processing happens through Groq's API with the configured model

## Error States

The system provides user-friendly error messages for all failure modes:

- **Timeouts**: "AI took too long to respond. Please try again."
- **Rate limits**: "Too many AI requests. Please wait X seconds."
- **Monthly cap**: "Your organization has reached the monthly AI usage limit."
- **Content filtered**: "Sorry, AI couldn't generate a suitable response."
- **Provider unavailable**: "AI service is currently unavailable."

Transient errors (timeouts, provider issues) are automatically retried once on the backend before surfacing to the operator.

## Technical Details

- **Provider**: Groq API via Vercel AI SDK
- **Model**: Configurable via `AI_MODEL` environment variable (default: `llama-3.3-70b-versatile`)
- **Backend route**: `POST /api/v1/ai/generate-reply`
- **Admin feature module**: `apps/admin/src/features/ai/`
- **Backend feature module**: `apps/hono-api/src/features/ai/`
