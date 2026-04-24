# Widget — XSS Hardening (Rendering Discipline)

**Phase:** 1 of the [widget security roadmap](../../../../../packages/docs/security/security-roadmap.md)
**Enforcement:** ESLint (`apps/widget/eslint.config.mjs`) + unit tests

## Rule

All dynamic content must be inserted via `textContent`, `replaceChildren()`, or element construction. The three HTML sinks — `innerHTML`, `outerHTML`, and `insertAdjacentHTML` — are banned by ESLint (`no-restricted-syntax`) in `src/widget/**/*.ts`. Static SVG icon assignments are the only sanctioned exceptions and each one carries an inline `// eslint-disable-next-line no-restricted-syntax -- static SVG …` comment.

## Why

The widget runs inside the host page's JavaScript realm. Shadow DOM is not a security boundary — any markup the widget writes to the DOM is parsed by the browser and executes in the host context. Hostile message content from visitors or operators, or malformed settings from the backend, would otherwise be interpreted as HTML.

## Approved static-SVG sites

| File | Line (approx.) | Content |
|---|---|---|
| `components/Header.ts` | `closeBtn.innerHTML = '<svg …>'` | Close icon — fully inline literal |
| `components/Launcher.ts` | `btn.innerHTML = ICON_SVGS[icon]` | One of three pre-composed SVG constants |
| `components/MessageList.ts` | `moreBtn.innerHTML = MORE_ICON` | `...` icon — module-level constant |
| `components/MessageList.ts` | `iconSpan.innerHTML = iconSvg` | `COPY_ICON` / `EDIT_ICON` / `DELETE_ICON` — passed from module constants |

Any new `innerHTML` usage requires the same disable comment with a `-- static SVG …` justification. Code review catches any unjustified disable.

## Tests

`components/MessageList.test.ts` renders hostile payloads (`<script>`, `<img onerror>`, `<svg onload>`, `<iframe>`, `<a href="javascript:">`, and JSON-broken `">` prefixes) through `createMessageList`, `appendMessage`, `updateMessageContent`, and `markMessageDeleted`. Assertions verify:

- `.message-text` contains zero child elements
- `.message-text.textContent` equals the raw payload literally
- No `<script>` tag is present anywhere in the bubble subtree
- A DOM-attached hostile `<img onerror>` does not set `window.__xss`

## Clearing DOM safely

Prefer `element.replaceChildren()` over `element.innerHTML = ""`. The two are equivalent for the empty case, but `replaceChildren()` does not route through the HTML sink and is not flagged by lint.
