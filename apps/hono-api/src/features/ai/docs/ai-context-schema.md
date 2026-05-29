# AI Context Schema

## Overview

The AI context system enables per-application context customization through an interview-based workflow. Admins configure AI behavior for each application by completing a structured interview, which produces a context summary used in prompt composition.

## Database Schema

### `applicationAiContext` Table

Stores the interview state and resulting context summary for each application.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, auto-generated | Row identifier |
| `applicationId` | UUID | FK → `applications.id`, unique, cascade delete | One-to-one with application |
| `status` | `aiContextStatusEnum` | NOT NULL | `in_progress` or `completed` |
| `interviewLog` | JSONB | NOT NULL, default `[]` | Array of `{ role, content }` interview messages |
| `currentTurn` | INTEGER | NOT NULL, default 0, CHECK (0-15) | Current turn in the interview flow |
| `contextSummary` | TEXT | nullable | Final summary produced after interview completion |
| `completedBy` | TEXT | FK → `user.id`, restrict delete | User who completed the interview |
| `completedAt` | TIMESTAMP | nullable | When the interview was completed |
| `createdAt` | TIMESTAMP | NOT NULL, auto | Row creation time |
| `updatedAt` | TIMESTAMP | NOT NULL, auto | Last update time |

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
