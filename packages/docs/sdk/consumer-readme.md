# Consumer README

## Overview

`packages/sdk/README.md` is the consumer-facing documentation that ships with the npm package. It is distinct from the internal `packages/sdk/docs/` directory (which covers architecture for contributors).

## Sections (Phase 2)

1. **One-liner** — single sentence describing what the SDK does
2. **Install** — `npm install` with collapsible alternatives for yarn/pnpm/bun
3. **CDN Quickstart** — script tag with `https://widget.yourdomain.com/widget.js` placeholder, shows `init` with `appId` and pre-init event listener registration
4. **npm Module Quickstart** — ES module import showing `init`, `getSdkApi()`, event listening, and `destroy`
5. **Command Queue** — explains the async pre-init pattern with full example covering `on`, `sendMessage`, `identify`, and `init` queue commands

## Design Decisions

- **CDN URL is a placeholder**: `https://widget.yourdomain.com/widget.js` — the actual URL depends on the tenant's widget deployment. This matches the architectural decision in `sdk-publish-ready.plan.md`.
- **getSdkApi() in npm examples**: The npm module path requires `getSdkApi()` to access methods like `on()`, `open()`, and `sendMessage()`. This is the public factory function exported from the barrel — not an internal class reference.
- **No internal architecture details**: The README avoids mentioning `ConnectionEngine`, `MessagePipeline`, `EventBridge`, or any module-level details. Consumers interact only with the public API surface.
- **Command queue mirrors real IIFE entry**: The documented queue commands (`init`, `on`, `sendMessage`, `identify`) match exactly what `apps/widget/src/widget/index.ts` replays from `queueHandlers`.
