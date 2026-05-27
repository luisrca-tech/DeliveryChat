# Chat Demo Lexical Editor

## Overview

The chat demo on `apps/web` uses a Lexical rich text editor instead of a plain `<input>`. This gives visitors the same rich formatting capabilities available in the admin panel, minus AI tools.

## Architecture

The editor lives in `components/lexical/` and mirrors the admin's Lexical implementation (`apps/admin/src/features/chat/components/lexical/`) with the following differences:

| Concern | Admin | Chat Demo |
|---------|-------|-----------|
| AI toolbar (Generate/Improve) | Yes | No |
| ExternalSendPlugin (markdown import/export) | Yes | No |
| SendButtonPlugin (triggerSend + isEmpty via ref) | No | Yes |
| Typing indicators | Via `onTypingStart`/`onTypingStop` props | Via `onKeyUp` throttle + `onBlur` |

### Component inventory

- **ChatLexicalEditor.tsx** — Main composer wrapping LexicalComposer with all plugins
- **ToolbarPlugin.tsx** — Formatting toolbar (Bold, Italic, Underline, Strikethrough, Code, Code Block, H1-H3, Bullet List, Numbered List, Link)
- **SendOnEnterPlugin.tsx** — Intercepts Enter to send, with plain-text auto-detection
- **SendButtonPlugin.tsx** — Exposes `triggerSend()` and `isEmpty()` via a ref for the external Send button
- **ListKeyboardPlugin.tsx** — Smart Enter handling inside lists (new bullet instead of send)
- **ClearEditorPlugin.tsx** — Clears editor content after sending
- **serializeLexicalJson.ts** — Client-side Lexical JSON → HTML serializer + plain text detector
- **linkInsert.ts** — Link insertion with selection capture/restore
- **listUtils.ts** — List-aware selection utilities
- **theme.ts** — Lexical theme class mapping (reuses `@repo/ui` CSS classes)

## Send flow

1. User types content in the Lexical editor
2. On Enter (outside lists) or Send button click → `SendOnEnterPlugin` / `SendButtonPlugin` fires
3. Editor state is serialized to JSON, then `isPlainTextLexicalJson()` checks if it's formatting-free
4. If plain → sends `contentFormat: "plain"` with extracted text
5. If rich → sends `contentFormat: "lexical"` with full Lexical JSON
6. `useMessageInput` creates an optimistic message with client-side `contentHtml` (via `serializeLexicalJsonToHtml`)
7. WebSocket payload includes `contentFormat` so the server stores the correct format
8. Editor clears after sending

## Keyboard behavior

- **Enter** — Sends message (unless cursor is in a list item)
- **Shift+Enter** — Soft line break
- **Ctrl/Alt/Meta+Enter** — In list: new list item. Outside list: soft line break.
- **Ctrl+B/I/U** — Bold, Italic, Underline (handled by Lexical's RichTextPlugin)

## Plain text auto-detection

`isPlainTextLexicalJson()` returns `{ plain: true, text }` when ALL of:
- Root contains only `paragraph` children
- Each paragraph contains only `text` and `linebreak` nodes
- All text nodes have `format: 0` (no bold, italic, code, etc.)

This avoids sending unnecessary Lexical JSON for simple text messages.
