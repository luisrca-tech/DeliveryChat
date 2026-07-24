# AI presentation in the demo chat

How the demo makes an AI-handled conversation _look_ like one, matching the real
widget. Companion to [`human-handoff.md`](./human-handoff.md), which covers the
"Talk to a human" button.

Both exist because the demo is a bespoke client: it calls the same
`/api/v1/widget` endpoints as the widget but shares no UI with
`@deliverychat/sdk`. Anything the SDK renders must be re-implemented here.

## Two visitor-facing signals

Both are **legally required bot disclosure** (California B.O.T. Act; EU AI Act
transparency), not styling polish. If AI is on, the visitor must be able to tell.

### 1. The opening disclosure line

> Hi! I'm Chat with us's AI Assistant. I can help you — or connect you to a
> person anytime.

Built by `lib/aiDisclosure.ts`, mirroring the SDK's `buildAiDisclosureMessage`
word for word. `header.title` supplies the tenant name and `ai.assistantLabel`
the assistant name, both from `GET /widget/settings/:appId`.

Rendered as a `type: "system"` row, which the thread already renders as centered
italic text. It is **client-side only** — never sent to the server, never
persisted. `useAiDisclosure` prepends it at render time rather than pushing it
into message state, so it cannot be edited, deleted, or mistaken for history.

Seeded once per conversation and then remembered, so it stays pinned at the top
as the thread grows. The `messageCount === 0` guard is what makes it correct for
both entry points, exactly as in the SDK: a new chat has no messages (seed);
reopening an old thread restores history (don't seed — the visitor was already
told). `loadingMessages` is part of the rule because mid-load the count is 0 but
not yet _known_, and seeding there would flash a greeting onto a thread that
turns out to have history.

**Known quirk, inherited deliberately:** with no `header.title` configured the
copy reads "I'm our's AI Assistant" — the SDK builds `${tenantName}'s` and falls
back to `"our"`. It is asserted in the tests so the demo cannot silently drift
from the widget. Fix it in the SDK first, then here.

### 2. The AI message bubble

Three cues, matching `packages/sdk/src/styles/main.css`:

| Cue            | Widget                                      | Demo                                         |
| -------------- | ------------------------------------------- | -------------------------------------------- |
| Bubble outline | `border: 1px solid var(--dc-primary-color)` | `border border-primary`                      |
| Avatar         | 24px circle, primary fill, bot glyph        | `h-6 w-6` circle, `bg-primary`, lucide `Bot` |
| Label          | 11px/600 in primary                         | `text-[10px] font-semibold text-primary`     |

The widget's `AI_AVATAR_ICON` is lucide's `Bot` inlined as SVG, so the demo uses
the icon component directly and gets a pixel-equivalent result.

## `authorType` is the whole mechanism

Styling keys off `msg.authorType === "ai"`. The demo's `Message` type previously
omitted the field, and — more subtly — `wsMessageReducer` destructured a fixed
set of payload keys and **dropped it**. Since AI replies arrive over the socket,
not the REST history, that silently defeated the styling for exactly the
messages it was meant for. Both paths now carry it, with a regression test.

The field is optional server-side for backward compatibility, so a payload
without it renders as a plain message rather than breaking.

## Settings are fetched once

`useWidgetSettings` performs the single `getSettings()` call. The disclosure, the
assistant label, and the handoff button all read from it, so they cannot
disagree about whether AI is on. A failed fetch leaves `aiEnabled` false and the
demo shows no AI affordances at all — rather than advertising behaviour the
backend would reject.
