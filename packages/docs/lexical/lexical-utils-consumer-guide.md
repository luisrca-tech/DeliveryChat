# @repo/lexical-utils Consumer Guide

`@repo/lexical-utils` is the shared package for Lexical editor serialization and React components. It has two entry points:

- `@repo/lexical-utils` — Pure TypeScript, no React dependency. Serialization and format detection.
- `@repo/lexical-utils/react` — React components (editor, plugins, toolbar). Peer deps on React 19 and `@lexical/*`.

## Rendering rich text from stored messages

The most common use case: you have a `contentFormat: "lexical"` message stored as JSON, and you want to render it as HTML.

```typescript
import { serializeLexicalJsonToHtml } from "@repo/lexical-utils";

const message = await getMessageFromDb();

if (message.contentFormat === "lexical") {
  const html = serializeLexicalJsonToHtml(message.content);
  // html is a string like "<p>Hello <strong>world</strong></p>"
  // or null if the JSON was malformed
}
```

Then render the HTML inside a container with the appropriate CSS class:

```tsx
// Admin / Web (uses @repo/ui styles)
<div className="rich-text-content" dangerouslySetInnerHTML={{ __html: html }} />

// Widget SDK (uses SDK styles)
// Apply class="rich-text" to the container
```

See [lexical-rich-text-css-contract.md](./lexical-rich-text-css-contract.md) for the CSS classes and their visual properties.

## Plain text extraction

For contexts where you need plain text (AI prompts, notifications, search indexing):

```typescript
import { serializeLexicalToPlainText } from "@repo/lexical-utils";

const plainText = serializeLexicalToPlainText(
  message.content,
  message.contentFormat, // "plain" | "lexical"
);
```

If `contentFormat` is `"plain"`, the content is returned as-is. If `"lexical"`, the JSON is parsed and text is extracted (formatting stripped, headings/lists preserved as text).

## Detecting plain text in Lexical JSON

When the editor produces JSON that is structurally Lexical but contains only unstyled text (no headings, lists, bold, etc.), you can downgrade the format to `"plain"` to save storage and simplify rendering:

```typescript
import { isPlainTextLexicalJson } from "@repo/lexical-utils";

const result = isPlainTextLexicalJson(editorJsonString);
if (result.plain) {
  // result.text contains the extracted plain text
  saveMessage(result.text, "plain");
} else {
  saveMessage(editorJsonString, "lexical");
}
```

## Server-side sanitization

The backend wraps `serializeLexicalJsonToHtml` with `sanitize-html` to strip XSS vectors before storing `contentHtml`. This is done in `apps/hono-api/src/features/chat/lexicalSerializer.ts`. Client-side consumers should use the pre-sanitized `contentHtml` field from the API response rather than calling `serializeLexicalJsonToHtml` directly on untrusted content.

## Using the React editor

```tsx
import { LexicalEditor } from "@repo/lexical-utils/react";

// Compose mode: full editor with toolbar, Enter-to-send
<LexicalEditor
  mode="compose"
  onSend={(content, isEmpty, contentFormat) => {
    if (!isEmpty) sendMessage(content, contentFormat);
  }}
/>

// Inline mode: no toolbar, pre-loaded content, save-on-blur
<LexicalEditor
  mode="inline"
  initialContent={existingLexicalJson}
  onSave={(content, contentFormat) => {
    updateMessage(content, contentFormat);
  }}
  onCancel={() => setEditing(false)}
/>
```

## Toolbar customization

The toolbar is composed from sub-components. Pass `toolbarSections` to include or exclude sections:

```tsx
import { LexicalEditor } from "@repo/lexical-utils/react";

// With AI section (admin)
<LexicalEditor
  mode="compose"
  toolbarSections={{
    format: true,
    heading: true,
    list: true,
    link: true,
    codeBlock: true,
    ai: { onGenerate, onImprove },
  }}
  onSend={handleSend}
/>

// Without AI section (web)
<LexicalEditor
  mode="compose"
  toolbarSections={{
    format: true,
    heading: true,
    list: true,
    link: true,
    codeBlock: true,
  }}
  onSend={handleSend}
/>
```
