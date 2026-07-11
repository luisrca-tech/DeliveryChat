# AI Assistant

## Overview

The AI Assistant helps operators respond to customer conversations faster by generating contextual reply suggestions. It uses a large language model (LLM) to analyze recent conversation history and produce a draft reply that matches the conversation's language and tone.

> **This document covers operator-assist only** (Generate Reply / Improve Message — an operator is still in the loop for every message sent). For the **autonomous** mode, where the AI answers visitors directly and escalates to a human on its own, see [AI Autonomous Assistant](ai-autonomous-assistant.md). The two modes are billed and gated independently (see that doc's billing/gating matrix) and share only the underlying provider plumbing (`aiUsageLog`, quota) and the guard-rail prompt layer described below.

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

### Improve Message

Operators can rewrite their draft message using AI for better tone and clarity.

**How it works:**

1. The operator writes a draft message in the input field
2. They click the "Improve Message" button (wand icon)
3. The AI rewrites the draft while preserving intent and language
4. The improved version appears with Accept / Reject controls
5. Accept keeps the improved text; Reject restores the original draft

**Constraints:**

- Same plan/rate/cap limits as Generate Reply
- Button is enabled only when the input field has content
- Both AI buttons are mutually disabled while either action is in-flight

### AI Usage Audit

Admins and super admins can view AI usage logs at Settings > AI Usage.

**Features:**

- Paginated table of all AI requests with timestamps, operator, action, status, model, tokens, and latency
- Filters by action type, status, operator, and date range
- Summary cards showing total requests, success rate, and average latency
- No message content is stored or displayed — metadata only

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

- **Application required**: "AI requires a conversation linked to an application." (HTTP 422, error code `ai_application_required`) — the conversation is not linked to any application.
- **AI not configured**: "AI is not available for this application. Contact your admin to complete the AI onboarding interview." (HTTP 403, error code `ai_not_configured`) — the application has not completed AI onboarding or `aiEnabled` is false.

Transient errors (timeouts, provider issues) are automatically retried once on the backend before surfacing to the operator.

### AI Interview & AI Context surfaces

The AI onboarding interview (and the regenerate-summary flow on the AI Context page) renders all backend error codes through a single component — `<InterviewErrorBoundary>` — fed by the discriminated union `InterviewErrorSurface`. Surfaces:

- `retry_row` (transient send failures): inline row with a "Try again" button.
- `system_bubble` (empty or content-filtered AI response): system message inside the chat scrollback; no retry button.
- `blocking_banner` (`ai_monthly_cap_exceeded`): banner above the composer; the composer is hidden.
- `missing_topics` (`interview_checklist_incomplete`): inline list of missing core topics next to the Finish button.
- `full_page_error` (`summary_generation_failed`): full-page block with a "Retry generation" button. Used both during the finish flow and on the AI Context page when `summaryStatus === "failed"` (the row is in partial-finish state and the operator can recover from it via the same `POST /generate-summary` endpoint).

Adding a new surface only requires editing `<InterviewErrorBoundary>` and the mapper — no other admin module switches on `surface.kind`.

## AI Output Format — Constrained Markdown

AI responses use a restricted Markdown subset instead of plain text, HTML, or Lexical JSON. The API response shape remains `{ text: string }` where `text` is Markdown.

### Allowed Syntax

| Construct | Syntax | Example |
|-----------|--------|---------|
| Bold | `**text**` | `**Important:** Your order is ready` |
| Heading H1 | `# Heading` | `# Order Status` |
| Heading H2 | `## Heading` | `## Tracking Details` |
| Heading H3 | `### Heading` | `### Next Steps` |
| Bullet list | `- item` or `* item` | `- Check your email` |
| Numbered list | `1. item` | `1. Open the tracking link` |
| Paragraphs | Plain text separated by blank lines | Standard paragraphs |

### Excluded from AI Output

Links, images, code blocks, inline code, italic, underline, blockquotes, HTML tags, tables, and H4+ headings are excluded. The model is instructed not to produce them, and `sanitizeAiMarkdown()` strips any that slip through.

### Backend Sanitization

After every successful LLM response, `sanitizeAiMarkdown()` runs before the `{ text }` response is returned:

- Strips HTML tags (including `<script>` / `<style>` content)
- Removes fenced code blocks but keeps inner text
- Strips inline code backticks
- Converts link syntax `[text](url)` to just `text`
- Preserves all allowed Markdown constructs

### Lexical Conversion on Insert

When the admin dashboard receives AI Markdown, it converts it to Lexical rich text nodes using `@lexical/markdown` with a restricted transformer list matching the allowed grammar. The operator sees the formatted result (bold text, headings, lists) in the Lexical editor and can further edit with the toolbar before sending.

If Markdown → Lexical conversion fails, the text is inserted as a single plain paragraph — no crash or data loss.

### Conversation Context

When building LLM context, rich text messages (`contentFormat: 'lexical'`) are serialized to plain text — the LLM never receives raw Lexical JSON. This ensures the model focuses on message meaning rather than editor internals.

## Application AI Context

Each application can have its own AI context, configured through an admin-driven interview flow. The interview is a multi-turn conversation (up to 15 turns) that produces a context summary used to customize AI responses for that specific application.

### Schema

- **`applicationAiContext`** table stores the interview state (`in_progress` / `completed`), the interview log (JSONB), the resulting context summary, and who completed it.
- **`aiEnabled`** boolean on `applications` controls whether AI features are active per-app.

### Summary generation & AI activation

Finishing the interview and turning the support AI assistant on are two separate, explicit actions:

1. **`complete`** — deterministic, no LLM call. Flips `status` to `completed` and stamps `completedBy`/`completedAt`. Leaves `applications.aiEnabled = false`. Both the normal admin Finish path and the forced turn-15 cap converge here.
2. **`generateSummary`** — LLM call via the isolated summary generator module. Persists `contextSummary` and flips `applications.aiEnabled = true`. Re-runnable while `status === 'completed'`; a failed regeneration leaves the prior `contextSummary` intact.

The summary generator logs each invocation with `action: 'interview_summary'` in `aiUsageLog` (token counts, latency, model, finish reason), and these rows are excluded from the monthly quota.

Engine-side, the interviewer system prompt mentions the 8–12 finish window, and the per-turn message builder injects a conditional nudge when the upcoming turn is between 8 and 12 inclusive and all six core topics are already covered.

See `apps/hono-api/src/features/ai/docs/interview-summary.md` for the full module contract, atomicity rules, and `aiUsageLog` semantics.

### Quota Exclusion

Interview LLM calls are logged with `action: "interview"` but excluded from the monthly usage cap. This ensures the setup process does not consume operational AI budget.

### Prompt Architecture

System prompts are composed from four layers:

1. **Role introduction** — identifies the AI's role based on the action
2. **Guard rails** — five safety categories applied universally:
   - **Security** — blocks prompt injection, system prompt leakage, and credential exposure
   - **Data & Honesty** — prevents hallucination of facts, prices, and unverified personal data
   - **Authority** — disallows commitments, refunds, or timeline promises on behalf of the company
   - **Scope** — restricts responses to the application's business domain
   - **Identity** — prevents claiming to be human or impersonating employees/brands
3. **Action instructions** — behavior specific to `generate`, `improve`, or `interview`
4. **Application context** — optional per-app context from the interview summary

All prompt composition uses the single `buildSystemPrompt()` API.

## Technical Details

- **Provider**: Groq API via Vercel AI SDK
- **Model**: Configurable via `AI_MODEL` environment variable (default: `llama-3.3-70b-versatile`)
- **Backend routes**: `POST /api/v1/ai/generate-reply`, `POST /api/v1/ai/improve-message`, `GET /api/v1/ai/usage`, `GET /api/v1/applications/:applicationId/ai-interview`, `POST /api/v1/applications/:applicationId/ai-interview/turns`, `POST /api/v1/applications/:applicationId/ai-interview/complete`
- **Interview model**: Configurable via `AI_INTERVIEW_MODEL` (default mirrors `AI_MODEL`).
- **Interview lifecycle**: `GET` returns the persisted state or a `not_started` sentinel. `POST /turns` with `{ expectedCurrentTurn: 0 }` and no message bootstraps the interview lazily; subsequent calls advance the turn under an optimistic lock on `currentTurn`. The server tracks core-topic coverage from each assistant turn's `topicsCoveredThisTurn`; once every core topic is covered the response exposes `canFinish: true`. When the LLM tries to wrap up early (`suggest_finish` with topics missing), the server silently downgrades the intent to `ask` and re-prompts the LLM to address the missing topics. The admin completes the interview explicitly via `POST /complete` with `{ expectedCurrentTurn }`: it returns `422 { error: 'interview_checklist_incomplete', missing }` if topics are still missing, `409 turn_conflict` on stale state, and `200` with `status='completed'`, `completedBy`, `completedAt` on success. `contextSummary` and `applications.aiEnabled` are intentionally not touched yet — flipping those is a later phase.
- **Turn cap and forced completion**: the interview is capped at **15 turns** (`MAX_TURNS`). Each advance turn carries a budget hint to the LLM so it paces its follow-ups. On the cap-hitting turn the server instructs the LLM to set `intent='final_question'`, overrides it server-side as a safety net, and flags the assistant log entry. When the admin submits their answer to that final question (i.e. `POST /turns` with `expectedCurrentTurn === 15`), the server skips the LLM, appends the user message, and forces `status='completed'` — bypassing the checklist so the admin is never blocked. The forced path is observable: the `aiUsageLog` row carries `finishReason='forced_cap_completion'`.
- **Admin feature module**: `apps/admin/src/features/ai/`
- **Backend feature module**: `apps/hono-api/src/features/ai/`
