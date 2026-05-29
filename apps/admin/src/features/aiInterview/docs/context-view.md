# AI Interview — Context View & Regenerate

Covers `AiContextPage`, the read view for completed interviews, and the regenerate-summary flow.

## Layout

Two stacked sections (mobile: vertical stack; ≥768px: same layout, summary first):

- **Summary** — markdown rendered via `MarkdownView` from `@repo/ui`. Includes completed metadata: who completed it (`completedByName`), when (`formatCompletedAt`), and a "Regenerate summary" action.
- **Transcript** — collapsed list of interview log entries; expandable to review the full back-and-forth.

## Regenerate summary

Triggered by the "Regenerate summary" button (admin/super_admin only). Flow:

1. Confirm dialog ("This will replace the current summary. Continue?").
2. On confirm: skeleton over the summary block; `POST /applications/:id/generate-summary` fires.
3. On success: cache patch (no full refetch), new summary fades in.
4. On error: surface mapped error via `interviewErrorMapper`; previous summary stays intact.

Regeneration **does not** re-run the interview — the existing `interviewLog` is reused. To redo the interview entirely, see [Redo TODO](../../../../../packages/docs/todo/redo-ai-interview.md).

## Out-of-scope (deferred)

- Editing the summary directly without regenerating — see [Edit summary TODO](../../../../../packages/docs/todo/edit-summary-directly.md).
- Redoing the interview from scratch.
