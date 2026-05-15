# SDK Build & Distribution

## Overview

The SDK is published to npm as `@deliverychat/sdk`, providing ESM, CJS, and TypeScript declaration outputs. Internally it remains a Turborepo workspace package consumed by `apps/widget/` for the IIFE embed build.

## Build Pipeline

### Library build (npm consumers)

Vite lib-mode (`vite.config.ts`) produces:

| Output | Path | Format | Consumers |
|--------|------|--------|-----------|
| ESM | `dist/index.mjs` | ES modules | Modern bundlers (Vite, esbuild, webpack 5+) |
| CJS | `dist/index.cjs` | CommonJS | Node.js, legacy bundlers |
| Types | `dist/*.d.ts` | TypeScript declarations | IDE autocomplete, type checking |

The `vite-plugin-dts` plugin generates declarations from source. Test files (`*.test.ts`) are excluded from declaration output.

### IIFE build (CDN embed)

`apps/widget/` imports from `@deliverychat/sdk` and produces a self-contained `widget.iife.js` via a separate Vite config (`vite.embed.config.ts`). This build:

- Bundles everything into a single IIFE assigned to `window.DeliveryChat`
- Generates an SRI hash artifact (`widget.iife.js.sri.json`)
- Copies the output to `public/widget.js` for serving

### Build order

Turborepo's `dependsOn: ["^build"]` ensures `@deliverychat/sdk` builds before `widget`. The widget embed build (`build:embed`) runs Vite separately and resolves workspace sources directly.

## Package Exports

The `exports` map in `package.json` provides correct resolution for all bundlers:

```json
{
  ".": {
    "import": { "types": "./dist/index.d.ts", "default": "./dist/index.mjs" },
    "require": { "types": "./dist/index.d.ts", "default": "./dist/index.cjs" }
  }
}
```

## Bundle Size Tracking

`scripts/CheckBundleSize.js` reads the SRI artifact from the widget IIFE build and checks that the bundle stays under 75 kB. Run with:

```bash
bun run check-bundle-size --filter=@deliverychat/sdk
```

## Tree-shaking

The ESM output is a single module. Consumers using modern bundlers can tree-shake unused exports. Headless-only usage (importing `getSdkApi` and `EventEmitter` without `init`) allows bundlers to eliminate widget UI code (components, Shadow DOM utilities, styles) from the final bundle.

## Publishing

```bash
cd packages/sdk
bun run build
npm publish --access public
```

The `files` field in `package.json` restricts the published package to `dist/` only.
