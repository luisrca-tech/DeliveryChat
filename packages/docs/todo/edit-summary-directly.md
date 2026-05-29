# TODO — Edit Summary Directly

## Context

After completing the AI interview (see [AI Interview](../ai-interview.md)), the generated markdown summary becomes the AI's grounding context for an application. Today, admins can only **regenerate** the summary from the existing interview log — they cannot directly edit it.

## What's Needed

Allow admins to open the summary in a markdown editor and save changes without going through the interview log or the LLM. This enables:

- Quick fixes to wording, typos, or formatting without spending a regeneration call.
- Adding facts that did not surface during the interview (new product name, updated tone guidance).
- Trimming sections that the summary generator over-emphasised.

## Considerations

- Preserve the original generated summary (or maintain a version history) so admins can revert.
- Track who edited the summary and when — surface this in the context view alongside `completedBy` / `completedAt`.
- Decide whether direct edits invalidate the link to the interview log (e.g. show a "manually edited" badge).
- The editor should match the rendering used in the context view (`MarkdownView` + `remark-gfm`).
- Validation: cap summary length, prevent saving an empty summary.
- Consider a future "AI assist" action inside the editor (e.g. "tighten this paragraph") instead of full regeneration.
