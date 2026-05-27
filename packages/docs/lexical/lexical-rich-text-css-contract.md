# Rich Text CSS Visual Contract

Two independent CSS implementations render the same HTML output from `serializeLexicalJsonToHtml()`. They are intentionally duplicated because the SDK runs inside a Shadow DOM with hard-coded RGBA values (no access to the host's CSS variables), while the admin UI uses the design system's CSS variables for theme support.

## Implementations

| Surface | File | Root class | Scope |
|---------|------|------------|-------|
| Admin / Web | `packages/ui/src/styles.css` | `.rich-text-content` | `@layer base` (Tailwind v4) |
| Widget SDK | `packages/sdk/src/styles/main.css` | `.rich-text` | `:where(.chat-widget)` (Shadow DOM) |

## Sender-context modifiers

Both implementations have sender-specific style overrides for backgrounds and link colors:

| Surface | Self/user messages | Other/visitor messages |
|---------|-------------------|-----------------------|
| Admin | `.rich-text-content--self` | `.rich-text-content--other` (default) |
| SDK | `.message-user .rich-text` | `.message-visitor .rich-text` |

## Shared visual properties

These values must stay aligned across both implementations. The table shows the design intent; the actual CSS values differ in notation (rem vs em, RGBA vs color-mix) but produce equivalent visual results.

### Typography

| Element | Font size | Font weight | Line height | Margin |
|---------|-----------|-------------|-------------|--------|
| Base container | inherit | inherit | 1.5 | — |
| `<h1>` | ~1.3–1.5× base | 700 | 1.3 | 4px / 0.25rem top+bottom |
| `<h2>` | ~1.15–1.25× base | 600 | 1.3 | 4px / 0.25rem top+bottom |
| `<h3>` | ~1.0–1.1× base | 600 | 1.3 | 4px / 0.25rem top+bottom |
| `<p>` | inherit | inherit | 1.5 (inherited) | 0 (SDK: 0 0 4px, last-child: 0) |
| `<strong>`, `<b>` | inherit | 700 | — | — |
| `<em>`, `<i>` | inherit | — (italic) | — | — |
| `<u>` | inherit | — (underline) | — | — |
| `<s>`, `<del>` | inherit | — (line-through) | — | — |

### Inline code (`<code>`)

| Property | Admin (CSS vars) | SDK (RGBA) |
|----------|-----------------|------------|
| Font family | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | same |
| Font size | 0.875em | 0.875em |
| Padding | 1px 4px (0.0625rem 0.25rem) | 1px 4px |
| Border radius | 4px (0.25rem) | 3px |
| Background (other) | `color-mix(foreground 8%)` | `rgba(0,0,0,0.08)` |
| Background (self) | `color-mix(primary-fg 18%)` | `rgba(255,255,255,0.2)` |

### Code blocks (`<pre>`)

| Property | Admin (CSS vars) | SDK (RGBA) |
|----------|-----------------|------------|
| Font family | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | same |
| Font size | 0.8125em | 0.85em |
| Line height | 1.4 | 1.4 |
| Padding | 8px 10px (0.5rem 0.625rem) | 8px 10px |
| Border radius | 6px (0.375rem) | 6px |
| Margin | 4px 0 (0.25rem 0) | 4px 0 |
| White space | pre-wrap | pre-wrap |
| Word break | break-word | break-word |
| Background (other) | `color-mix(foreground 6%)` | `rgba(0,0,0,0.06)` |
| Background (self) | `color-mix(primary-fg 14%)` | `rgba(255,255,255,0.15)` |
| Nested `<code>` | padding: 0, background: none, font-size: inherit | same |

### Lists

| Property | Admin | SDK |
|----------|-------|-----|
| `<ul>` style | disc | disc |
| `<ol>` style | decimal | decimal |
| Padding left | 1.5rem (24px) | 20px |
| Margin | 0.25rem 0 (4px 0) | 4px 0 |
| `<li>` margin | 0.125rem 0 (2px 0) | 2px 0 |

### Links (`<a>`)

| Property | Admin | SDK |
|----------|-------|-----|
| Default color | `var(--color-primary)` | `inherit` |
| Self/user color | `inherit` | `inherit` |
| Visitor color | — | `var(--dc-primary-color, #0ea5e9)` |
| Text decoration | underline | underline |
| Word break | break-word | break-word |
| Hover | opacity: 0.8 | — |

## Why the duplication is intentional

1. **Shadow DOM isolation**: The widget SDK renders inside a Shadow DOM. CSS variables from the host page are not inherited, so the SDK uses hard-coded RGBA values.
2. **Theme support**: The admin UI supports light/dark modes via CSS variables (`color-mix` with `--color-foreground`). Converting these to RGBA would break theming.
3. **Independent deployment**: The SDK is distributed as an IIFE bundle. Coupling it to the UI package would create a runtime dependency the widget can't afford.

## When to update

If you change the visual appearance of any element in either stylesheet, update the other to match — and update this document. The authoritative source of truth for the visual contract is the CSS itself; this document is a cross-reference to make drift visible.

## HTML output reference

Both surfaces render the HTML produced by `serializeLexicalJsonToHtml()` from `@repo/lexical-utils`. The serializer produces elements: `<p>`, `<h1>`–`<h3>`, `<strong>`, `<em>`, `<u>`, `<s>`, `<code>`, `<pre><code>`, `<ul>`, `<ol>`, `<li>`, `<a>`, `<br>`, `<blockquote>`.
