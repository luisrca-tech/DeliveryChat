# Content Format — Rich Text Support

## Overview

Messages support two content formats via the `contentFormat` discriminator:

- **`plain`** (default) — raw text stored in `content`. `contentHtml` is `null`.
- **`lexical`** — Lexical `EditorState` JSON stored in `content`. `contentHtml` is computed server-side from the JSON.

## Schema

- `contentFormatEnum`: PostgreSQL enum with values `'plain'` | `'lexical'`.
- `messages.content_format`: NOT NULL, defaults to `'plain'`.
- No data migration — existing messages remain `plain`.

## Serialization

`serializeLexicalToHtml(content, contentFormat)` in `lexicalSerializer.ts`:

- Returns `null` for `plain` format.
- Walks the Lexical JSON tree and produces HTML for `lexical` format.
- Output is sanitized via `sanitize-html` to prevent XSS.
- Graceful fallback: malformed JSON or invalid structure returns escaped content wrapped in `<p>`.

Supported Lexical node types: `paragraph`, `heading`, `list`, `listitem`, `quote`, `code`, `text`, `linebreak`, `link`, `autolink`, `code-highlight`.

Text format flags: bold (1), italic (2), strikethrough (4), underline (8), inline code (16).

## API Contract

All message responses include three fields:

```typescript
{
  content: string; // raw content (plain text or Lexical JSON)
  contentFormat: "plain" | "lexical";
  contentHtml: string | null; // sanitized HTML for lexical, null for plain
}
```

This applies to:

- REST: `GET /conversations/:id/messages`, `POST /conversations/:id/messages`
- WebSocket: `message:new`, `message:edited`, `messages:sync`

## Backward Compatibility

- Existing messages have `contentFormat: 'plain'` and `contentHtml: null`.
- Clients that don't send `contentFormat` default to `'plain'`.
- The `content` column type is unchanged — Lexical JSON fits in `text`.
