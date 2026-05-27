# Rich Text Rendering in Widget

## Overview

The widget renders rich text messages sent by operators/admins from the admin dashboard. The widget itself has no rich text editing — visitors type plain text only.

## Content Format Discriminator

Every `ChatMessage` now carries two optional fields:

- `contentFormat`: `"plain"` (default) or `"lexical"` — indicates how `content` should be interpreted
- `contentHtml`: pre-sanitized HTML string (server-computed from Lexical JSON) or `null` for plain text

## Rendering Rules

| `contentFormat` | `contentHtml` | Rendering |
|---|---|---|
| `"plain"` or absent | `null` or absent | `textContent` assignment (XSS-safe) |
| `"lexical"` | Non-null HTML string | `innerHTML` assignment with `.rich-text` class |

The server sanitizes `contentHtml` using `sanitize-html` before sending it. The widget trusts this pre-sanitized output — no Lexical dependency is added to the widget bundle.

## Textarea Input

The widget input was upgraded from `<input type="text">` to an auto-resizing `<textarea>`:

- **Auto-resize**: grows from 1 row up to a max height of 120px
- **Send**: Enter key sends the message
- **New lines**: Ctrl+Enter and Alt+Enter insert line breaks
- **No rich text**: visitors send plain text only (`contentFormat` is never set by the widget)

## Rich Text CSS

Scoped styles for rich content elements live in `styles/main.css` under the `.rich-text` class selector, nested within `:where(.chat-widget)` for Shadow DOM isolation. Styled elements include:

- Headings (h1, h2, h3)
- Lists (ul/ol with proper indentation)
- Inline code and code blocks (pre)
- Bold, italic, underline, strikethrough
- Links (with theme-aware colors for operator messages)

## Security Considerations

- Server-computed `contentHtml` is sanitized before transmission — no raw Lexical JSON is parsed client-side
- Plain text messages always use safe `textContent` assignment, never `innerHTML`
- Shadow DOM prevents any rich text CSS from leaking into or from the host page
