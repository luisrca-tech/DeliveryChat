# Rich Text Rendering (Chat Demo)

## Overview

The chat demo renders rich text messages from operators using pre-sanitized HTML (`contentHtml`) provided by the server. No client-side Lexical deserialization is needed.

## Content Format Model

Messages carry two optional fields:

- `contentFormat`: `"plain" | "lexical"` — indicates how `content` should be interpreted.
- `contentHtml`: pre-rendered, sanitized HTML computed server-side for `contentFormat: "lexical"` messages.

When `contentFormat === "lexical"` and `contentHtml` is present, the renderer displays the HTML via `dangerouslySetInnerHTML`. Otherwise, `content` is rendered as plain text.

## Data Flow

1. Server broadcasts `message:new` or `message:edited` with `contentFormat` and `contentHtml` fields.
2. `wsMessageReducer` passes these fields through to the message state.
3. `MessageThreadPanel` checks `msg.contentFormat === "lexical" && msg.contentHtml` and renders accordingly.
4. Rich HTML is wrapped in `.rich-text-content` + `.rich-text-content--self` / `--other` CSS classes for styled rendering.

## CSS Styles

All rich text styles (bold, italic, headings, lists, code blocks, links) are defined in `packages/ui/src/styles.css` under the `.rich-text-content` class hierarchy. The web app imports these via `@repo/ui/styles.css` in `Layout.astro`.

## Testing

- **Reducer tests** (`__tests__/wsMessageReducer.test.ts`): verify `contentFormat` and `contentHtml` passthrough for `message:new`, `message:edited`, and `messages:sync` events.
- **Component tests** (`components/__tests__/MessageRichText.test.tsx`): verify rendering branch (HTML for lexical, text for plain), CSS class application, and null `contentHtml` fallback.
