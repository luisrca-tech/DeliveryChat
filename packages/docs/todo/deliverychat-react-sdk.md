# Future: @deliverychat/react SDK Package

## Vision

Publish a public React package (`@deliverychat/react`) that third-party developers can install to get pre-built, styled components for rendering DeliveryChat rich text messages — without needing to depend on Lexical or implement their own rendering logic.

Today, API/SDK consumers receive `contentHtml` (pre-sanitized HTML) and render it with `dangerouslySetInnerHTML`. This works but leaves styling entirely to the consumer. A React SDK would provide drop-in components with the same visual fidelity as the admin dashboard and widget.

## What it would export

- `<RichTextMessage content={msg.content} contentFormat={msg.contentFormat} contentHtml={msg.contentHtml} />` — renders a message with proper formatting, using `contentHtml` when available and falling back to client-side serialization via `@repo/lexical-utils`.
- `<MessageList messages={messages} />` — optional higher-level component for rendering a conversation thread.
- CSS styles (importable or injected) matching the visual contract documented in `packages/docs/lexical/lexical-rich-text-css-contract.md`.
- Utility re-exports from `@repo/lexical-utils` (`serializeLexicalJsonToHtml`, `serializeLexicalToPlainText`) for consumers who want lower-level control.

## How it relates to existing packages

- `@repo/lexical-utils` — internal monorepo package with the serialization engine and editor components. The React SDK would depend on its pure TS entry point for serialization but would NOT re-export the editor (that stays internal).
- `@deliverychat/sdk` — the existing widget IIFE bundle. The React SDK is a separate concern: the widget is an embeddable iframe, the React SDK is a component library for custom integrations.

## Prerequisites before building

1. Stable public API — the message format (`contentFormat`, `contentHtml`, `content`) must be considered stable.
2. Versioning strategy — semver with clear breaking change policy for the rendered HTML structure.
3. CSS strategy decision — ship as CSS module, Tailwind plugin, or unstyled (headless) with a default theme.
4. Publish pipeline — npm publish from CI, scoped under `@deliverychat`.

## Open questions

- Should the package be headless (unstyled) with an optional theme, or opinionated with the current visual contract?
- Should it include a Lexical editor component for consumers who want rich text input (not just rendering)?
- Package scope: `@deliverychat/react` or something more specific like `@deliverychat/react-messages`?
