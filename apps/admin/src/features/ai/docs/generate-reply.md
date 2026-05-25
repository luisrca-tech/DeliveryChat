# Generate Reply — Admin UI

## Overview

The "Generate Reply" feature allows operators on PREMIUM and ENTERPRISE plans to use AI to generate reply suggestions for active conversations. The AI analyzes recent conversation messages and produces a contextual reply draft.

## Architecture

### Feature Structure

```
apps/admin/src/features/ai/
├── components/          # (reserved for Phase 2)
├── hooks/
│   ├── useGenerateReply.ts    # TanStack Query mutation with AbortController
│   └── useAiAvailability.ts   # Plan-based feature gating
├── lib/
│   ├── ai.client.ts           # API client (fetch wrapper + AiApiError)
│   └── aiErrorMessages.ts     # Error code → user-friendly message mapping
├── types/
│   └── ai.types.ts            # Error codes, response types
└── docs/
    └── generate-reply.md      # This file
```

### Integration Point

The AI button is integrated directly into `MessageInput.tsx` (chat feature). This keeps the chat input cohesive while the AI logic lives in its own feature folder.

## User Flow

1. Operator opens an active conversation
2. "Generate Reply" button (sparkles icon) appears next to the input — only if the tenant is on PREMIUM or ENTERPRISE plan
3. Button is enabled only when the input is empty
4. Click → loading state (spinner, input disabled, "Generating AI reply..." placeholder)
5. On success → AI text populates the input with a visual "AI suggestion" indicator (violet accent border + pill)
6. Operator can:
   - Edit the suggestion freely (indicator disappears on edit)
   - Send it as-is (Enter or Send button)
   - Clear it (Clear button next to the pill)
7. On error → toast notification with user-friendly message per error code

## Plan Gating

| Plan       | AI Button Visible |
|------------|-------------------|
| FREE       | No (hidden)       |
| BASIC      | No (hidden)       |
| PREMIUM    | Yes               |
| ENTERPRISE | Yes               |

The button is completely hidden (not just disabled) for FREE/BASIC plans. This uses the existing `useBillingStatusQuery()` hook.

## Error Handling

Each backend error code maps to a specific user-friendly toast message:

| Error Code                 | Toast Message                                    |
|---------------------------|--------------------------------------------------|
| `ai_timeout`              | "AI took too long to respond..."                 |
| `ai_provider_busy`        | "AI is temporarily busy..."                      |
| `ai_provider_unavailable` | "AI service is currently unavailable..."         |
| `ai_empty_response`       | "Sorry, AI couldn't generate a response..."      |
| `ai_content_filtered`     | "Sorry, AI couldn't generate a suitable..."      |
| `ai_monthly_cap_exceeded` | "Your organization has reached the monthly..."   |
| `ai_rate_limit_exceeded`  | "Too many AI requests. Please wait X seconds..." |

## Cancellation

- In-flight requests are cancelled via `AbortController` when:
  - The component unmounts
  - The conversation changes
  - The operator clicks the button again during generation (toggles to cancel)
- Abort errors are silently swallowed (no error toast)

## Backend Endpoint

`POST /api/v1/ai/generate-reply`

- Request: `{ conversationId: string (UUID) }`
- Response: `{ text: string }`
- Auth: session cookie + tenant slug header (auto-injected by `getTenantHeaders()`)
- Guards: tenant auth → role (operator+) → billing status → AI feature gate → rate limit
