# Lexical Rich Text Editor (Phase 2)

## Overview

Replaces the admin dashboard's plain `<Input>` in `MessageInput` with a Lexical rich text editor. Adds rich text rendering in `MessageBubble` and inline editing for lexical messages.

## Architecture

### Editor Components (`components/lexical/`)

- **`LexicalEditor`** — Main composer with toolbar, used in `MessageInput`. Wraps Lexical's `LexicalComposer` with all required plugins.
- **`ToolbarPlugin`** — Fixed toolbar with formatting buttons: Bold, Italic, Underline, Strikethrough, Link, Inline Code, Code Block, Heading (H1/H2/H3), Bullet List, Numbered List.
- **`SendOnEnterPlugin`** — Enter sends message (serializes editor state to JSON). Ctrl+Enter, Alt+Enter, Shift+Enter insert line breaks.
- **`ClearEditorPlugin`** — Exposes a ref-based `clear()` function for resetting editor after send.
- **`ExternalSendPlugin`** — Exposes a `triggerSend()` handle so the Send button can programmatically send.
- **`InlineEditLexical`** — Toolbar-less editor pre-loaded with a message's Lexical JSON for inline editing. Enter saves, Escape cancels.
- **`theme.ts`** — Lexical theme class map for consistent styling.

### Data Flow

1. User types in Lexical editor with formatting.
2. On Enter (or Send button click), editor state is serialized to JSON string.
3. `MessageInput.onSend(json, "lexical")` is called.
4. `useSendMessage.send(conversationId, content, "lexical")` creates optimistic message and sends `message:send` event with `contentFormat: "lexical"`.
5. Server persists the Lexical JSON, serializes to HTML, and broadcasts `message:new` with `contentHtml`.
6. `handleMessageNew` maps `contentFormat` and `contentHtml` into the admin `Message` type.
7. `MessageBubble` renders `contentHtml` via `dangerouslySetInnerHTML` with `.rich-text-content` CSS class.

### Message Type Changes

```ts
type Message = {
  // ... existing fields
  contentFormat: ContentFormat; // "plain" | "lexical"
  contentHtml: string | null;  // sanitized HTML from server, null for plain
};
```

### Inline Edit Behavior

- **Lexical messages**: Opens `InlineEditLexical` with the original Lexical JSON. No toolbar (keeps the edit compact). Saves as `contentFormat: "lexical"`.
- **Plain messages**: Keeps the existing `<textarea>` edit behavior.

### Styling

All Lexical editor styles and rich text rendering styles are defined in `packages/ui/src/styles.css` under `@layer components`. Two sets of classes:
- `.lexical-*` classes for the editor's live editing view.
- `.rich-text-content` scoped styles for rendered HTML in message bubbles.

## Business Rules

- All messages from the admin editor are sent as `contentFormat: "lexical"`.
- Plain text messages from the widget continue rendering as plain text.
- System messages remain unchanged.
- Undo/redo via Ctrl+Z / Ctrl+Shift+Z (no toolbar buttons).
- AI toolbar integration is deferred to Phase 4.
