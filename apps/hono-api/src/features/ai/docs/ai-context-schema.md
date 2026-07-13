# AI Context Schema

## Overview

The AI context system enables per-application context customization through an interview-based workflow. Admins configure AI behavior for each application by completing a structured interview, which produces a context summary used in prompt composition.

## Database Schema

### `applicationAiContext` Table

Stores the interview state and resulting context summary for each application.

| Column           | Type                  | Constraints                                    | Description                                       |
| ---------------- | --------------------- | ---------------------------------------------- | ------------------------------------------------- |
| `id`             | UUID                  | PK, auto-generated                             | Row identifier                                    |
| `applicationId`  | UUID                  | FK → `applications.id`, unique, cascade delete | One-to-one with application                       |
| `status`         | `aiContextStatusEnum` | NOT NULL                                       | `in_progress` or `completed`                      |
| `interviewLog`   | JSONB                 | NOT NULL, default `[]`                         | Array of `{ role, content }` interview messages   |
| `currentTurn`    | INTEGER               | NOT NULL, default 0, CHECK (0-15)              | Current turn in the interview flow                |
| `contextSummary` | TEXT                  | nullable                                       | Final summary produced after interview completion |
| `completedBy`    | TEXT                  | FK → `user.id`, restrict delete                | User who completed the interview                  |
| `completedAt`    | TIMESTAMP             | nullable                                       | When the interview was completed                  |
| `createdAt`      | TIMESTAMP             | NOT NULL, auto                                 | Row creation time                                 |
| `updatedAt`      | TIMESTAMP             | NOT NULL, auto                                 | Last update time                                  |

### `aiContextStatusEnum`

- `in_progress` — interview is active, not yet completed
- `completed` — interview finished, `contextSummary` is populated

### `applications` Table Addition

- `aiEnabled` — `BOOLEAN`, NOT NULL, default `false`. Controls whether AI features are active for this specific application.

### `aiActionEnum` Addition

- `interview` — added to the existing enum (`generate`, `improve`, `interview`). Used to log interview LLM calls in `aiUsageLog`.

## Relations

- `applicationAiContext` ↔ `applications`: one-to-one via unique `applicationId`
- `applicationAiContext` → `user`: many-to-one via `completedBy` (restrict delete prevents orphaning)

## Quota Exclusion

Interview actions are excluded from the monthly AI usage cap. The `requireAiFeature()` middleware filters out rows where `action = 'interview'` when counting quota usage. This ensures that the setup process does not consume the tenant's operational AI budget.

Excluded actions are defined in `QUOTA_EXCLUDED_ACTIONS` in `ai.middleware.ts`.

## Guard-Rail Enhancement

All AI actions (`generate`, `improve`) include a set of universal guard rails injected into the system prompt via `baseGuardRails()` in `ai.context.ts`. The rules are organized into five categories:

### Security

Prevents prompt injection, system prompt leakage, and credential exposure. Rules block attempts to override the AI's role, extract internal configuration, or output secrets and admin URLs.

### Data & Honesty

Prevents hallucination of facts, prices, policies, order numbers, or account details. The AI must explicitly acknowledge uncertainty rather than fabricate information. Unverified personal data must never be confirmed or repeated back.

### Authority

Prevents the AI from making commitments on behalf of the company. Refunds, discounts, plan changes, and timeline promises are all disallowed unless explicitly authorized. Out-of-scope requests must be escalated to a human operator.

### Scope

Restricts responses to the application's business domain. The AI refuses to discuss politics, religion, or unrelated topics, and does not provide medical, legal, or financial advice.

### Identity

Prevents the AI from claiming to be human, impersonating employees or brands, or pretending to have direct system access. The AI must always identify as a customer support assistant.

Each category is formatted as a labeled section (`[Category]`) followed by its rules, and all categories are concatenated into a single guard-rail block by `baseGuardRails()`. This block is included in every system prompt regardless of the action type.

## AI Blocking for Unconfigured Apps

Before executing any AI action (`generate` or `improve`), two validation checks run to ensure the request has a valid application context. These checks are defined in `ai.service.ts`.

### Application Required (422)

**Function:** `requireApplicationId(applicationId)`

If the conversation is not linked to an application (`applicationId` is null), the request is rejected immediately.

- **HTTP status:** 422 Unprocessable Entity
- **Error code:** `ai_application_required`
- **Message:** "AI requires a conversation linked to an application."
- **Error class:** `AIApplicationRequiredError`

This prevents orphaned conversations (not associated with any application) from triggering AI calls.

### AI Not Configured (403)

**Function:** `requireApplicationAiContext(applicationId)`

Queries the `applications` table joined with `applicationAiContext`. The request is blocked if:

- The application does not exist, OR
- `aiEnabled` is `false` on the application (the onboarding interview has not been completed)

When blocked:

- **HTTP status:** 403 Forbidden
- **Error code:** `ai_not_configured`
- **Message:** "AI is not available for this application. Contact your admin to complete the AI onboarding interview."
- **Error class:** `AINotConfiguredError`

If the application passes validation and has a completed interview (`status = 'completed'`), the function returns the `contextSummary` for use in prompt composition. If AI is enabled but no completed interview exists, the context summary is `undefined` and the AI operates without application-specific context.

Both checks are mapped to their HTTP responses in `ai.errorMapper.ts`.
