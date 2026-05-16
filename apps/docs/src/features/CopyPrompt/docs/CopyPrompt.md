# CopyPrompt Feature

## Purpose

Provides AI-friendly quickstart prompts that users copy into their AI coding assistants (Cursor, Copilot, Claude, etc.) to get a working DeliveryChat integration in one shot.

## Architecture

### Components

- `components/CopyPrompt.tsx` — Generic presentational component with copy-to-clipboard and collapsible preview. Accepts any prompt string.
- `components/SdkCopyPrompt.tsx` — Pre-wired wrapper binding the SDK prompt constant.
- `components/EmbedCopyPrompt.tsx` — Pre-wired wrapper binding the CDN embed prompt constant.

### Constants

- `constants/SdkPrompt.ts` — Full SDK integration prompt as a string constant.
- `constants/EmbedPrompt.ts` — Full CDN embed integration prompt as a string constant.

### Contract Validation

The prompt constants are validated against the real SDK public API via `packages/sdk/src/prompt-contract.test.ts`. This test reads the prompt files and asserts that every public method and event from the SDK/widget is mentioned. If the SDK API changes and prompts are not updated, this test fails.

### Registration

Both `SdkCopyPrompt` and `EmbedCopyPrompt` are registered in `mdx-components.tsx` so they can be used directly in MDX pages without imports.

## Design Decisions

1. **Feature folder colocation** — Component, constants, and docs live together under `features/CopyPrompt/`. The `src/components/CopyPrompt.tsx` file is a thin re-export for backwards compatibility with mdx-components.
2. **Separate generic from wrappers** — The generic `CopyPrompt` component is purely presentational (props-driven). Wrappers (`SdkCopyPrompt`, `EmbedCopyPrompt`) are separate files that bind specific content. Adding a new prompt variant requires only a new constant file and a new one-file wrapper.
3. **Contract test in SDK package** — The test lives in the SDK package (not docs) because it validates SDK API completeness. If a method is added to the SDK, the test catches the drift immediately during `bun run test --filter=sdk`.
4. **Collapsible preview** — Prompts are long; showing them expanded by default would push page content down. Preview is opt-in via a toggle button.
5. **Purple accent** — Differentiates AI prompt blocks from standard code blocks visually.

## Usage in MDX

```mdx
<SdkCopyPrompt />

<EmbedCopyPrompt />
```

No imports needed — registered globally via `mdx-components.tsx`.
