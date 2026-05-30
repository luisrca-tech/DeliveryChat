# AI Interview — Error Mapping Reference

`mapInterviewErrorToSurface` (in `lib/interviewErrorMapper.ts`) translates backend error envelopes into a discriminated union of UI surfaces. No bare `toast.error("Something went wrong")` is allowed in the feature.

`<InterviewErrorBoundary>` (in `components/InterviewErrorBoundary.tsx`) owns all per-surface rendering. The `InterviewErrorSurface` type is exported from `lib/interviewErrorMapper.ts` so the boundary and the controller can type the value passed between them, but **no other module** in the feature switches on `surface.kind`. Adding a new surface requires editing only the boundary (plus the mapper and the type union).

Callers feed the boundary a surface and the two retry callbacks they support:

```tsx
<InterviewErrorBoundary
  surface={controller.errorSurface}
  onRetrySend={controller.callbacks.retrySend}
  onRetrySummary={controller.callbacks.retrySummary}
  isSending={controller.isSendingTurn}
/>
```

The boundary returns `null` for `toast_fallback` (toasts are fired by the controller / page) and for `surface === null`.

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
4. Add a rendering branch in `<InterviewErrorBoundary>` if it is a new variant kind.
5. Add a Vitest case in `interviewErrorMapper.test.ts` asserting the new mapping, and one in `InterviewErrorBoundary.test.tsx` asserting the rendering.
