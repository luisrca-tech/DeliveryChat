# AI Interview — Editorial Redesign

Design system reference for the redesigned AI interview surfaces (intro cover, active interview, summary spread). This document captures the editorial vocabulary, the primitive inventory, and the rules a future contributor needs to extend the experience without breaking its voice.

## Editorial vocabulary

The redesigned interview reads like a curated print magazine rather than a chat product. Every screen is composed from a small alphabet of typographic elements:

- **Eyebrow** — uppercase, tracked, sans (Geist) label. Carries section identity (round number, topic, or a guardrail signal). Optionally followed by a 1px under-rule (solid neutral or dashed amber).
- **Display headline** — Fraunces variable serif at 1.2 line-height. Used for the question text and for the summary spread headline.
- **Standfirst / voice-of-app** — italic Fraunces at body size. Used for placeholders, the suggested-finish band, completion line, conflict toast body, and the regenerating plate.
- **Body** — Geist Sans at base size. Used for the visitor's answer, fine print, and the markdown brief.
- **Rules** — 1px neutral horizontal rule (between sections), 1px dashed amber rule (under guardrail eyebrows), 2px accent vertical left-rule (composer, answer indent, marginalia, send error).
- **Text-link** — every primary action is rendered as a real `<button>` styled as an accent-colored text link with a `→` glyph. The arrow is purely decorative (`aria-hidden`); the button label carries meaning.

### Tones

| Tone        | CSS variable                          | Used for                                              |
| ----------- | ------------------------------------- | ----------------------------------------------------- |
| Foreground  | `--interview-color-foreground`        | Display headlines, primary body                       |
| Muted       | `--interview-color-muted`             | Eyebrows, fine print, disabled actions                |
| Accent      | `--interview-color-accent`            | Final-question eyebrow, text-links, left-rules        |
| Amber       | `--interview-color-amber`             | Guardrail eyebrows and their dashed under-rules       |

Amber is the only state color in the system. There is no destructive red and no success green — error states are communicated through copy and the dashed amber rule.

### Typography stack

- **Display**: Fraunces Variable (self-hosted via `@fontsource-variable/fraunces`, `font-display: swap`). Italic axis is used for standfirst/placeholder/voice copy.
- **Body**: Geist Variable (self-hosted via `@fontsource-variable/geist`, `font-display: swap`).
- **Mono**: none. Code spans inside the markdown brief use the body face with the accent color.

All theme tokens live in `apps/admin/src/features/aiInterview/styles/interview-theme.css` under the `.interview-theme` scope. Dark mode is achieved by overriding only the four color tokens and the texture; the paper-grain pattern is preserved by adjusting opacity, not by swapping the texture itself.

## Primitive inventory

All primitives live in `apps/admin/src/features/aiInterview/components/` and have colocated snapshot tests.

| Primitive                | Purpose                                                                 | A11y notes                                                                                          |
| ------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `InterviewEyebrow`       | Uppercase tracked label with optional under-rule. 5 variants.           | Renders as `<p data-variant>`; under-rule is decorative `::after`.                                  |
| `InterviewTextLink`      | Real `<button>` styled as accent text-link. Loading swaps to italic.    | `type="button"` default; arrow is `aria-hidden`; disabled state is muted; `:focus-visible` ring.    |
| `InterviewQuestionBlock` | Eyebrow + serif display question. Applies eyebrow precedence.           | `<article>` landmark; amber under-rule is decorative.                                               |
| `InterviewAnswerBlock`   | Indented sans-serif answer with 2px accent left-rule.                   | Plain text block; no interactive elements.                                                          |
| `InterviewRuler`         | Three-zone editorial progress ruler with large serif numeral.           | `aria-label="Turn N of M"`; numeral is `aria-hidden`; visible duplicate "Turn N of M" caption.      |
| `InterviewMarginalia`    | Indented italic note for send errors and conflict-style asides.         | `role="status"` by default, `role="alert"` for errors; configurable via prop.                       |

The existing legacy components (`InterviewChatScrollback`, `InterviewIntroCard`, etc.) are kept for non-editorial code paths but no longer drive the redesigned surfaces.

## Eyebrow precedence

`InterviewQuestionBlock` resolves the eyebrow variant deterministically from the turn payload. Top match wins:

1. `intent === "final_question"` → `FINAL QUESTION` (accent variant, no under-rule, no topic appended).
2. `guardrailAction === "pushback_garbage"` → `LET'S REFOCUS · {Topic}` (refocus variant, amber tone, 1px dashed amber under-rule).
3. `guardrailAction === "redirect_scope"` → `STAYING ON TRACK · {Topic}` (staying variant, amber tone, 1px dashed amber under-rule).
4. Default → `{Topic} · ROUND {N}` (default variant, muted tone, 1px solid neutral under-rule).

`{Topic}` is `topicsCoveredThisTurn[0]` title-cased, falling back to `Discovery` when absent. `{N}` is the 1-based assistant-turn index within the visible log.

## Action vocabulary

Every primary action is a text-link. Names are stable across all surfaces so existing E2E selectors continue to resolve:

| Action               | Where it appears                                                                | Loading label        |
| -------------------- | -------------------------------------------------------------------------------- | -------------------- |
| `Begin interview →`  | Intro cover                                                                      | `Starting…`          |
| `Send →`             | Composer (auto-grow textarea, italic placeholder)                                | `Sending…`           |
| `Finish interview →` | Header text-link (suggested window), inline band, cap-reached state, completion | `Finishing…`         |
| `Retry →`            | Send-error marginalia                                                            | `Retrying…`          |
| `Regenerate summary →` | Summary spread header                                                          | `Rewriting your brief…` |

Disabled text-links lose the arrow and drop to muted color. Loading text-links swap their label to italic Fraunces in the muted tone, with no spinner.

## In-page vs. toast state handling

The redesign deliberately separates surface state from session state:

- **In-page**: state that belongs to the manuscript flow is rendered inline so the reading position is preserved. This covers the composer (sending, cap-reached), the next-question slot (thinking → reveal), guardrail eyebrows, the suggested-finish band, the completion line, the post-finish generating plate, and full-page error plates.
- **Toast**: only the turn-conflict notice uses sonner, with a custom italic-serif JSX body and a ~5s dismiss. The rationale is that a turn conflict is a transient session-level event, not a manuscript event — it does not change what the reader is looking at, only acknowledges that another tab won the race.

Error surfaces that span the whole page (load error, summary failure, summary pending retry) are rendered as centered editorial plates rather than shadcn alert cards. They follow the same shape: serif headline, sans paragraph, single text-link action.

## Layout rules

- **Intro cover** — single column, eyebrow / headline / standfirst / fine print / `Begin interview →` / topic dot-list, against the paper texture. No card chrome.
- **Active interview** — header carries the ruler (only when `phase === "active"`) and the suggested-finish header link when applicable; the body is a vertical sequence of Q&A blocks; the composer sits at the bottom as a manuscript-margin input.
- **Summary spread** — full-width editorial header (eyebrow, headline, byline, regenerate text-link), then a two-column body on desktop (markdown brief on the left at ~65ch, sticky transcript on the right at `md:w-[22rem]`). Mobile stacks the columns with a horizontal rule separator.

## Test-id contract

These data-test-ids are preserved on the new editorial surfaces so existing E2E selectors keep working:

- `interview-finish-cta-header` — header `Finish interview →` text-link.
- `interview-finish-cta-bubble` — inline italic-serif suggested-finish band.
- `interview-input-locked` — cap-reached composer surface.
- `interview-generating-state` — post-finish "Generating your AI context…" plate.
- `ai-context-regenerate-button` — summary header `Regenerate summary →` text-link.
- `ai-context-summary-skeleton` — regenerate loading surface (now the italic-serif line + animated accent rule).

## Accessibility

- All primary actions are real `<button>` elements with reachable focus styles (`:focus-visible` 2px accent outline at 3px offset).
- Decorative arrows, under-rules, and the ruler numeral are marked `aria-hidden`.
- The ruler exposes `aria-label="Turn N of M"` and a visible duplicate caption so screen-reader users and sighted users receive the same information.
- `InterviewMarginalia` defaults to `role="status"` and escalates to `role="alert"` for failure cases.
- Color contrast was verified for the accent token (`#3B5BDB` light, `#7AA0FF` dark) against the paper-texture background in both themes.

## Extension guidance

When adding a new editorial surface:

1. Reuse the primitives above before introducing a new one. If a primitive does not fit, prefer extending an existing component with a variant over adding a parallel component.
2. Keep state inline unless the state is session-level (then toast). Never render a shadcn card on an editorial surface.
3. Run every new action through `InterviewTextLink` — do not introduce raw `<a>` or shadcn `Button` for primary actions.
4. Pull color, font, and texture from the CSS variables. Never hardcode hex values in component files.
5. Update this document when you add a primitive, change the eyebrow precedence, or introduce a new tone.
