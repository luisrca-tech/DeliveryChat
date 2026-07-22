# Content Format (Rich Text Support)

## Summary

Messages now support a `contentFormat` field that discriminates between plain text and rich text (Lexical JSON). Server-side HTML serialization ensures clients can render rich content without parsing Lexical JSON themselves.

## Message Fields

| Field           | Type                   | Description                                                               |
| --------------- | ---------------------- | ------------------------------------------------------------------------- |
| `content`       | `string`               | Raw message content — plain text or serialized Lexical `EditorState` JSON |
| `contentFormat` | `"plain" \| "lexical"` | Discriminator indicating the format of `content`                          |
| `contentHtml`   | `string \| null`       | Pre-sanitized HTML for `lexical` messages; `null` for `plain`             |

## Sending Messages

### REST

```http
POST /v1/conversations/:id/messages
Content-Type: application/json

{
  "content": "{\"root\":{\"children\":[...],\"type\":\"root\",\"version\":1}}",
  "contentFormat": "lexical"
}
```

Omitting `contentFormat` defaults to `"plain"`.

### WebSocket

```json
{
  "type": "message:send",
  "payload": {
    "conversationId": "...",
    "content": "{\"root\":{...}}",
    "contentFormat": "lexical",
    "clientMessageId": "..."
  }
}
```

## Receiving Messages

All message responses (REST and WebSocket events) include `contentFormat` and `contentHtml`.

For `plain` messages:

```json
{
  "content": "Hello world",
  "contentFormat": "plain",
  "contentHtml": null
}
```

For `lexical` messages:

```json
{
  "content": "{\"root\":{...}}",
  "contentFormat": "lexical",
  "contentHtml": "<p><b>Hello</b> world</p>"
}
```

## Backward Compatibility

- Existing messages remain `contentFormat: "plain"` with no data migration.
- Clients that don't send `contentFormat` default to `"plain"`.
- The existing `content` field is unchanged — no breaking changes.
