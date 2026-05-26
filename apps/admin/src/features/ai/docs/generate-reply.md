# AI Assistant — Admin UI

## Overview

The AI assistant provides two actions for operators on PREMIUM and ENTERPRISE plans:

1. **Generate Reply** — generate a new reply suggestion from conversation context (input must be empty)
2. **Improve Message** — rewrite an existing draft for clarity and professionalism (input must have content)

## Architecture

### Feature Structure

```
apps/admin/src/features/ai/
├── hooks/
│   ├── useGenerateReply.ts    # TanStack Query mutation with AbortController
│   ├── useImproveMessage.ts   # TanStack Query mutation with AbortController
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

Both AI buttons are integrated directly into `MessageInput.tsx` (chat feature). This keeps the chat input cohesive while the AI logic lives in its own feature folder.

## Generate Reply Flow

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

## Improve Message Flow (Three-State Machine)

The Improve Message feature uses a `idle → generating → review → idle` state machine:

1. Operator types a draft in the input
2. "Improve Message" button (wand icon) is enabled when input has content
3. Click → state transitions to `generating`:
   - Original draft is preserved in client state
   - Textarea is locked (disabled), shows "Improving message..." placeholder
   - Both AI buttons and Send button are disabled
4. On success → state transitions to `review`:
   - Improved text shown in the textarea with amber accent border
   - "AI improvement" pill with Accept and Reject controls
   - Textarea is read-only, Send button disabled
5. **Accept**: keeps improved text, returns to `idle`, operator can edit or send
6. **Reject**: restores original draft instantly (no LLM call), returns to `idle`

### Mutual Exclusion

Both AI buttons are disabled while either action is in-flight. This prevents conflicting requests.

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

## Backend Endpoints

### `POST /api/v1/ai/generate-reply`

- Request: `{ conversationId: string (UUID) }`
- Response: `{ text: string }`
- Auth: session cookie + tenant slug header (auto-injected by `getTenantHeaders()`)
- Guards: tenant auth → role (operator+) → billing status → AI feature gate → rate limit

### `POST /api/v1/ai/improve-message`

- Request: `{ conversationId: string (UUID), draft: string (1-4000 chars) }`
- Response: `{ text: string }`
- Auth: same as generate-reply
- Guards: same middleware chain as generate-reply
