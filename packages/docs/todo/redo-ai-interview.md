# TODO — Redo AI Interview

## Context

The AI application context interview (see `plans/ai-guardrails-and-context.md`) allows admins to onboard an application's AI by completing a conversational interview. The initial implementation is one-shot: once completed, the interview results are read-only.

## What's Needed

Allow admins to redo the interview for an application that has already completed it. This enables:

- Updating AI context when the business changes (new products, tone shift, different support scenarios).
- Improving context quality if the original interview was rushed or incomplete.
- Re-generating the markdown summary with an improved summary generator prompt without re-interviewing.

## Considerations

- Preserve the previous interview as history (version the `applicationAiContext` row or keep a log of past interviews).
- The `version` field on `applicationAiContext` could track iteration count.
- During a redo, the existing `aiEnabled` should remain `true` and the current context summary should stay active until the new interview completes.
- Consider allowing "re-generate summary only" (re-process existing interview log with an improved summary prompt) as a cheaper alternative to a full redo.
