# Rich Text Platform Strategy

## Content Format Model

Every message carries three fields that together describe its content:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `content` | `string` | — | Raw message body: plain text or serialized Lexical `EditorState` JSON |
| `contentFormat` | `"plain" \| "lexical"` | `"plain"` | Discriminator for interpreting `content` |
| `contentHtml` | `string \| null` | `null` | Pre-sanitized HTML computed server-side for `lexical` messages |

The backend always computes `contentHtml` when `contentFormat` is `"lexical"`. Clients render `contentHtml` directly — they never need to parse Lexical JSON.

For details on the schema, serialization pipeline, and backward compatibility, see [content-format.md](content-format.md).

## Two-Tier SDK Strategy

### Current: Vanilla IIFE Embed (`packages/sdk`)

The production embed script (`widget.iife.js`) is a lightweight, framework-agnostic bundle that works on any website — WordPress, Shopify, static sites, SPAs.

- **Visitor input**: Plain `<textarea>`. No rich text editing, no Lexical dependency.
- **Rich rendering**: Checks `contentFormat === "lexical"` and renders `contentHtml` via `innerHTML`. Operator messages with formatting (bold, headings, lists, code blocks, links) display correctly.
- **Trade-off**: Visitors cannot send formatted messages, but the widget stays small and loads fast. This is intentional — the embed targets the widest possible integration surface.

### Future: `@deliverychat/react` Package (planned)

An optional React package that provides Lexical editor components for React-based integrations. This would allow customers building React apps to offer rich text input to their visitors with the same editor experience as the admin panel.

- Ships as a separate npm package, not bundled into the IIFE embed.
- Provides pre-configured Lexical editor with the formatting toolbar (no AI tools).
- Handles `contentFormat` detection (plain vs lexical) and `contentHtml` computation automatically.

## Rendering Approach Per Surface

### Admin Panel (`apps/admin`)

| Aspect | Behavior |
|--------|----------|
| **Editor** | Lexical rich text editor, always on. Toolbar: Bold, Italic, Underline, Strikethrough, Code, Code Block, H1-H3, Bullet/Numbered List, Link, AI Generate, AI Improve. |
| **Plain-text detection** | `isPlainTextLexicalJson()` auto-detects when content has no formatting and sends as `contentFormat: "plain"` to avoid unnecessary JSON overhead. |
| **Rendering** | Uses `contentHtml` from server. For optimistic messages, computes `contentHtml` client-side via `serializeLexicalJsonToHtml()`. Falls back to the same serializer if `contentHtml` is missing. |
| **Inline editing** | Edits preserve format. Lexical messages re-open in the Lexical editor; plain messages use a text input. |

### SDK Widget (`packages/sdk`)

| Aspect | Behavior |
|--------|----------|
| **Editor** | Plain `<textarea>`. All visitor messages are `contentFormat: "plain"`. |
| **Rendering** | If `contentFormat === "lexical"`, renders `contentHtml` via `innerHTML`. Otherwise, displays `content` as text. |
| **Styling** | Rich content styles (headings, lists, code blocks, links) are scoped within the Shadow DOM. |

### Chat Demo (`apps/web`)

| Aspect | Behavior |
|--------|----------|
| **Editor** | Lexical rich text editor (same node set as admin, without AI toolbar actions). Toolbar: Bold, Italic, Underline, Strikethrough, Code, Code Block, H1-H3, Bullet/Numbered List, Link. |
| **Plain-text detection** | Same `isPlainTextLexicalJson()` logic — unformatted messages send as `contentFormat: "plain"`. |
| **Rendering** | Checks `contentFormat === "lexical"` and renders `contentHtml` via `dangerouslySetInnerHTML`. Plain messages render as text. |
| **Purpose** | Showcases the rich text experience on the landing page so prospects can evaluate the platform's capabilities. |

### Third-Party REST API Integrations

| Aspect | Behavior |
|--------|----------|
| **Receiving** | Every message response includes `contentFormat` and `contentHtml`. Integrators render `contentHtml` as HTML — no Lexical knowledge required. |
| **Sending (simple)** | Omit `contentFormat` or set it to `"plain"` and send plain text in `content`. This is the recommended path for most integrations. |
| **Sending (advanced)** | Set `contentFormat: "lexical"` and send a valid Lexical `EditorState` JSON string in `content`. The server computes `contentHtml` and returns it in the response. |

## REST API Examples

### Send a Plain Text Message

```http
POST /v1/conversations/:id/messages
Authorization: Bearer dk_live_...
X-App-Id: app_...
Content-Type: application/json

{
  "content": "Your order has shipped!"
}
```

`contentFormat` defaults to `"plain"`. The response includes `contentHtml: null`.

### Send a Lexical Rich Text Message

```http
POST /v1/conversations/:id/messages
Authorization: Bearer dk_live_...
X-App-Id: app_...
Content-Type: application/json

{
  "content": "{\"root\":{\"children\":[{\"children\":[{\"detail\":0,\"format\":1,\"mode\":\"normal\",\"style\":\"\",\"text\":\"Important:\",\"type\":\"text\",\"version\":1},{\"detail\":0,\"format\":0,\"mode\":\"normal\",\"style\":\"\",\"text\":\" Your order has shipped.\",\"type\":\"text\",\"version\":1}],\"direction\":\"ltr\",\"format\":\"\",\"indent\":0,\"type\":\"paragraph\",\"version\":1}],\"direction\":\"ltr\",\"format\":\"\",\"indent\":0,\"type\":\"root\",\"version\":1}}",
  "contentFormat": "lexical"
}
```

The response includes `contentHtml: "<p><b>Important:</b> Your order has shipped.</p>"`.

### Read Messages with Rich Content

```http
GET /v1/conversations/:id/messages
Authorization: Bearer dk_live_...
X-App-Id: app_...
```

```json
{
  "data": [
    {
      "id": "msg_abc",
      "content": "Hello!",
      "contentFormat": "plain",
      "contentHtml": null
    },
    {
      "id": "msg_def",
      "content": "{\"root\":{...}}",
      "contentFormat": "lexical",
      "contentHtml": "<p><b>Important:</b> Your order has shipped.</p>"
    }
  ]
}
```

Use `contentHtml` for rendering when available. For `plain` messages, render `content` as text.

## Design Principles

1. **Rich rendering is always on.** No configuration toggle. Every surface renders `contentHtml` when present.
2. **Server owns HTML serialization.** Clients never parse Lexical JSON for rendering — they use `contentHtml`. This keeps client logic simple and ensures consistent output.
3. **Input complexity scales with the surface.** The admin panel and chat demo have full Lexical editors. The vanilla SDK widget keeps a plain textarea. The future React package will bridge the gap for React integrations.
4. **Backward compatible by default.** Omitting `contentFormat` gives `"plain"`. Existing messages stay unchanged. Clients that don't understand rich text still work — they just show `content` as text.
