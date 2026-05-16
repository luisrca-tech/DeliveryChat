# CopyPrompt Feature

## Purpose

Provides AI-friendly quickstart prompts that users copy into their AI coding assistants (Cursor, Copilot, Claude, etc.) to get a working DeliveryChat integration in one shot.

## Architecture

### Components

- `src/components/CopyPrompt.tsx` — Base component with copy-to-clipboard and collapsible preview.
- `SdkCopyPrompt` — Pre-wired wrapper for the SDK npm prompt.
- `EmbedCopyPrompt` — Pre-wired wrapper for the CDN widget embed prompt.

### Constants

- `src/constants/SdkPrompt.ts` — Full SDK integration prompt as a string constant.
- `src/constants/EmbedPrompt.ts` — Full CDN embed integration prompt as a string constant.

### Registration

Both `SdkCopyPrompt` and `EmbedCopyPrompt` are registered in `mdx-components.tsx` so they can be used directly in MDX pages without imports.

## Design Decisions

1. **Separate constants from component** — Prompts are versioned, testable string constants. The component is purely presentational.
2. **Pre-wired wrappers over props** — MDX pages cannot import constants, so `SdkCopyPrompt`/`EmbedCopyPrompt` bundle the prompt internally. This keeps MDX usage clean (`<SdkCopyPrompt />` with no props).
3. **Collapsible preview** — Prompts are long; showing them expanded by default would push page content down. Preview is opt-in via a toggle button.
4. **Purple accent** — Differentiates AI prompt blocks from standard code blocks visually.

## Usage in MDX

```mdx
<SdkCopyPrompt />

<EmbedCopyPrompt />
```

No imports needed — registered globally via `mdx-components.tsx`.
