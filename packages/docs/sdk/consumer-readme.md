# Consumer README

## Overview

`packages/sdk/README.md` is the consumer-facing documentation that ships with the npm package. It is distinct from the internal `packages/sdk/docs/` directory (which covers architecture for contributors).

## Sections

### Phase 2 — Install & Quickstarts

1. **One-liner** — single sentence describing what the SDK does
2. **Install** — `npm install` with collapsible alternatives for yarn/pnpm/bun
3. **CDN Quickstart** — script tag with `https://widget.yourdomain.com/widget.js` placeholder, shows `init` with `appId` and pre-init event listener registration
4. **npm Module Quickstart** — ES module import showing `init`, `getSdkApi()`, event listening, and `destroy`
5. **Command Queue** — explains the async pre-init pattern with full example covering `on`, `sendMessage`, `identify`, and `init` queue commands

### Phase 3 — Advanced Usage & API Reference

6. **Headless Mode** — `headless: true` init, programmatic `sendMessage`/`getConversation`, event listening without UI. Notes that UI methods become no-ops and `open`/`close` events are suppressed.
7. **Events** — table of all 8 events with payload types and descriptions. Includes the full `ChatMessage` type shape for `message:received` and `message:sent` payloads.
8. **Identify** — basic `identify({ externalId, email, name })` usage plus HMAC verification section with server-side Node.js `crypto.createHmac` example.
9. **API Reference** — table of all 12 public methods (`init`, `destroy`, `open`, `close`, `toggle`, `hideWidget`, `showWidget`, `sendMessage`, `identify`, `getConversation`, `on`, `off`) with TypeScript signatures and one-line descriptions. Includes `InitOptions` type shape.
10. **Browser Support** — latest 2 major versions of Chrome, Firefox, Safari, Edge.

## Design Decisions

- **CDN URL is a placeholder**: `https://widget.yourdomain.com/widget.js` — the actual URL depends on the tenant's widget deployment. This matches the architectural decision in `sdk-publish-ready.plan.md`.
- **getSdkApi() in npm examples**: The npm module path requires `getSdkApi()` to access methods like `on()`, `open()`, and `sendMessage()`. This is the public factory function exported from the barrel — not an internal class reference.
- **No internal architecture details**: The README avoids mentioning `ConnectionEngine`, `MessagePipeline`, `EventBridge`, or any module-level details. Consumers interact only with the public API surface.
- **Command queue mirrors real IIFE entry**: The documented queue commands (`init`, `on`, `sendMessage`, `identify`) match exactly what `apps/widget/src/widget/index.ts` replays from `queueHandlers`.
- **Headless mode documents no-ops explicitly**: UI methods (`open`, `close`, `toggle`, `hideWidget`, `showWidget`) become no-ops in headless mode. The `open`/`close` events are suppressed. This matches the `EventBridge` behavior in `SdkApi`.
- **Events table uses exact SdkEventMap types**: All 8 events and their payloads come directly from `SdkEventMap.ts`. The `ChatMessage` shape is documented inline so consumers don't need to reference source types.
- **HMAC example uses Node.js crypto**: Server-side `crypto.createHmac("sha256", secret).update(externalId).digest("hex")` is the canonical pattern. The secret env var is named `DELIVERYCHAT_IDENTITY_SECRET` as a consumer-facing convention.
- **API reference covers all DeliveryChatAPI methods**: The 12 methods match the `DeliveryChatAPI` type in `types/index.ts` (excluding the internal `queue` property).
