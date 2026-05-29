# AI Interview — Error Mapping Reference

`mapInterviewErrorToSurface` (in `lib/interviewErrorMapper.ts`) translates backend error envelopes into a discriminated union of UI surfaces. No bare `toast.error("Something went wrong")` is allowed in the feature.

## Table

| Backend `code`                  | HTTP | Surface (`kind`)     | Where it renders                                  |
| ------------------------------- | ---- | -------------------- | ------------------------------------------------- |
| `ai_timeout`                    | 504  | `retry_row`          | Inline row below the failed turn                  |
| `ai_provider_busy`              | 503  | `retry_row`          | Inline row below the failed turn                  |
| `ai_provider_unavailable`       | 503  | `retry_row`          | Inline row below the failed turn                  |
| `ai_empty_response`             | 502  | `system_bubble`      | System bubble in the scrollback                   |
| `ai_content_filtered`           | 422  | `system_bubble`      | System bubble in the scrollback                   |
| `interview_checklist_incomplete`| 422  | `missing_topics`     | Inline list near Finish button (humanised labels) |
| `summary_generation_failed`     | 500  | `full_page_error`    | Full-page error on the loading view               |
| `ai_monthly_cap_exceeded`       | 429  | `blocking_banner`    | Pinned banner above the composer                  |
| `expectedCurrentTurn` mismatch  | 409  | _(silent refetch)_   | No surface — `useInterviewState` refetches        |
| _(anything else / 5xx / no code)_ | * | `toast_fallback`     | Generic toast with code suffix                    |

## Adding a new code

1. Extend `RetryableCode` or `SystemBubbleCode` if the new code fits an existing surface, or add a new variant to `InterviewErrorSurface`.
2. Add a copy entry next to the existing tables (`RETRY_COPY`, `SYSTEM_BUBBLE_COPY`, etc.).
3. Add a branch in `mapInterviewErrorToSurface`.
4. Add a Vitest case in `interviewErrorMapper.test.ts` asserting the new mapping.
