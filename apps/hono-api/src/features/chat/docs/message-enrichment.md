# Message Enrichment

## Overview

All message objects returned by `chat.service.ts` are **enriched** with pre-computed `contentHtml` and `contentPlainText` fields. This eliminates duplicate serialization logic across handlers, routes, and WebSocket broadcasts.

## How it works

The `enrichMessage()` function in `chat.service.ts` is a generic function that takes any message-like object (must have `content` and `contentFormat` fields) and returns it with two additional fields:

- **`contentHtml`**: Sanitized HTML produced by `serializeLexicalToHtml()` from `lexicalSerializer.ts`. Returns `null` for plain text messages.
- **`contentPlainText`**: Plain text extraction via `serializeLexicalToPlainText()` from `@repo/lexical-utils`. For plain text messages, returns the content as-is.

## Enriched service methods

These service methods return enriched messages:

| Method                         | Returns                                       |
| ------------------------------ | --------------------------------------------- |
| `sendMessage()`                | Single enriched message                       |
| `editMessage()`                | Single enriched message                       |
| `getMessageHistory()`          | Array of enriched messages                    |
| `getMessageHistoryForMember()` | Array of enriched messages (with sender info) |
| `getMessagesSince()`           | Array of enriched messages                    |

## Consumers

- **WebSocket handlers** (`chat.handlers.ts`) read `contentHtml` from the enriched message for broadcast events instead of calling the serializer directly.
- **REST routes** (`queries.ts`) return enriched messages directly without map+serialize blocks.
- **AI context** (`ai.context.ts`) reads `contentPlainText` from enriched messages instead of calling `serializeLexicalToPlainText()` directly.

## Design decisions

- `enrichMessage()` is exported so `ai.service.ts` can enrich messages from its own DB queries before passing them to `buildContext()`.
- Sanitization (`sanitize-html`) stays in `lexicalSerializer.ts` on the backend — the shared `@repo/lexical-utils` package produces raw HTML, the backend wrapper sanitizes it.
- The function is generic (`<T extends ...>`) to preserve the caller's specific message shape (e.g., messages with `senderName` from joins).
