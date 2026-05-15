# SDK Publish Automation

## Overview

The `@deliverychat/sdk` package uses a `prepublishOnly` lifecycle hook to guarantee that dist artifacts are always fresh before any publish to npm. This eliminates the risk of publishing stale or missing build outputs.

## How It Works

Running `npm publish` from `packages/sdk/` triggers the following automatically:

1. `prepublishOnly` fires → runs `bun run build`
2. Vite lib-mode produces `dist/index.mjs`, `dist/index.cjs`, and `dist/*.d.ts`
3. npm packs only the files listed in the `files` field (`dist/`)
4. Package is published to the npm registry

No manual `bun run build` step is needed before publishing.

## Published Artifacts

| File             | Format     | Purpose                            |
| ---------------- | ---------- | ---------------------------------- |
| `dist/index.mjs` | ES modules | Modern bundlers (Vite, esbuild)    |
| `dist/index.cjs` | CommonJS   | Node.js, legacy bundlers           |
| `dist/*.d.ts`    | TypeScript | IDE autocomplete, type checking    |

## Version History

| Version | Status     | Notes                                        |
| ------- | ---------- | -------------------------------------------- |
| `1.0.0` | **stable** | First stable release with publish safety net |
| `0.1.0` | deprecated | Placeholder — use `1.0.0` or later           |
