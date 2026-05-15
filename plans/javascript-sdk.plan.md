# Plan: JavaScript SDK (`@deliverychat/sdk`)

> Source PRD: `plans/javascript-sdk.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Package**: `packages/sdk/` — new monorepo package (`@repo/sdk`) owning all SDK logic: WebSocket client, state management, event emitter, widget UI rendering, headless API, identity management.
- **Widget shell**: `apps/widget/` becomes a thin IIFE build shell that imports from `@repo/sdk` and outputs `widget.iife.js`. It owns only the Vite IIFE build config and the global `window.DeliveryChat` entry point.
- **Public global**: `window.DeliveryChat` — unchanged from today. Command queue pattern preserved.
- **npm package**: `@deliverychat/sdk` — ESM + CJS + TypeScript declarations. Tree-shakeable.
- **CDN build**: IIFE format, same SRI hash generation, same `dist-embed/` output path.
- **Schema (new table)**: `visitorIdentities` — `id`, `anonymousUserId` (FK → `user`), `organizationId`, `externalId`, `email`, `name`, `metadata` (JSONB), `hmacVerified` (boolean), timestamps. Created via `createTable()` with `delivery_chat_` prefix.
- **API routes (new)**:
  - `POST /api/v1/widget/identify` — accepts identity data from SDK, stores/updates `visitorIdentities` record.
- **Event system**: Typed `EventEmitter<EventMap>` class, separate from internal `state.ts` pub-sub. Events: `ready`, `open`, `close`, `message:received`, `message:sent`, `conversation:started`, `conversation:resolved`, `unread:changed`.
- **Init options extension**: `headless: boolean` (default `false`) added to `InitOptions`. Existing options unchanged.
- **Identity verification**: HMAC-SHA256 opt-in per tenant. Toggle stored in tenant/organization settings. Signature: `HMAC-SHA256(apiSecretKey, userId)`.
- **Documentation**: New `v1/sdk/` section in `apps/docs` with sub-pages: `quickstart.mdx`, `methods.mdx`, `events.mdx`, `identity.mdx`, `headless.mdx`.

---

## Phase 1: Extract widget internals to `packages/sdk/` ✅ DONE

**User stories**: 22, 23

### What was built

Created `packages/sdk/` as a new monorepo package. Moved all widget internals from `apps/widget/src/widget/` (state management, WebSocket client, chat controller, REST API client, visitor management, conversation persistence, UI components, Shadow DOM utilities, types, constants) into `packages/sdk/src/`. Updated all internal imports. Refactored `apps/widget/` to become a thin IIFE entry point that imports from `@repo/sdk` and wires the `window.DeliveryChat` global with the command queue pattern.

### Acceptance criteria

- [x] `packages/sdk/` exists with its own `package.json` (`@repo/sdk`), `tsconfig.json`, and Vitest config
- [x] All files from `apps/widget/src/widget/` live in `packages/sdk/src/` with correct internal imports
- [x] `apps/widget/` entry point imports from `@repo/sdk` and only wires the global + command queue
- [x] `bun run build --filter=widget` produces a working `widget.iife.js` in `dist-embed/`
- [x] SRI hash generation still works (`widget.js.sri.json`)
- [x] All migrated tests pass (`bun run test --filter=sdk`)
- [x] `bun run check-types` passes across the entire monorepo
- [x] Feature doc in `packages/sdk/docs/extraction.md` covering the restructuring decisions
- [x] Branch: `feature/java-script-sdk-implementation`

### Potential risks

- **Import path drift**: As the codebase evolves, contributors may accidentally add direct imports from `packages/sdk/src/` internals in `apps/widget/` instead of going through `@repo/sdk` barrel export. Consider adding an ESLint rule to enforce the boundary.
- **Duplicate test environments**: SDK tests require `jsdom` (configured in `packages/sdk/vitest.config.ts`) but running `bunx vitest run` from root can pick up the wrong config, causing `document is not defined` errors. Tests must be run from `packages/sdk/` or via `bun run test --filter=sdk`.
- **Build order dependency**: `apps/widget/` depends on `@repo/sdk` at build time. If Turborepo dependency graph is misconfigured, IIFE builds may fail in CI with missing module errors.
- **Shadow DOM CSS isolation**: Moving components to a separate package doesn't change Shadow DOM behavior, but future changes to the package boundary could accidentally break style injection if the `injectStyles` utility loses its Shadow Root reference.

---

## Phase 2: Public API + Typed Event System ✅ DONE

**User stories**: 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 28

### What was built

Added programmatic control methods to the SDK: `open()`, `close()`, `toggle()`, `hideWidget()`, `showWidget()`. Built a typed `EventEmitter<EventMap>` class with `on(event, callback)` and `off(event, callback)`. Wired internal state transitions via `EventBridge` to fire public events at semantic boundaries. Updated the IIFE entry and command queue to support the new methods and pre-init `on` listener replay. Added `widgetVisible` state for launcher visibility control. Implemented `SdkApi` singleton pattern with `getSdkApi()` / `resetSdkApi()`.

### Acceptance criteria

- [x] `open()`, `close()`, `toggle()` control chat window visibility from external code
- [x] `hideWidget()` and `showWidget()` control launcher button visibility
- [x] `on(event, callback)` subscribes to events with typed payloads
- [x] `off(event, callback)` unsubscribes correctly
- [x] All 8 events fire at the correct semantic boundaries with correct payloads
- [x] Calling methods before `init()` produces clear error messages (not silent failures)
- [x] Event listeners registered before `init()` via the command queue are replayed on init
- [x] TypeScript consumers get full IntelliSense for event names and callback signatures
- [x] IIFE build exposes all new methods on `window.DeliveryChat`
- [x] Unit tests for `EventEmitter` (subscribe, unsubscribe, multiple listeners, typed payloads)
- [x] Integration tests for each event firing in the correct lifecycle moment
- [x] Feature doc in `packages/sdk/docs/events.md` covering the event system design
- [x] Branch: `feature/java-script-sdk-implementation`

### Potential risks

- **Message ACK ID mismatch**: The `message:sent` event relies on detecting when a pending visitor message is replaced by a server-acknowledged one with a different ID. If the server ever keeps the client ID (e.g., idempotency key), the `pendingVisitorIds` Set pattern would fail to detect the ACK. The bridge would need to also check for `status` changes on the same ID.
- **Event ordering sensitivity**: The EventBridge subscribes to each state key independently. If two related state changes happen in the same microtask (e.g., `conversationId` + `conversationStatus`), the event firing order depends on subscription registration order — which is currently deterministic but fragile if refactored.
- **Memory leaks from unremoved listeners**: If a host page calls `on()` without a matching `off()` and the widget is never destroyed, listeners accumulate. There is no `maxListeners` warning. Long-running SPAs that re-init repeatedly without destroying could leak.
- **Pre-init `on()` bypasses init guard**: `on()`/`off()` work before `init()` by design (for command queue replay), but this means a listener could be attached to an emitter that never fires if `init()` is never called — no error or warning is surfaced to the developer.
- **Singleton reset in tests**: The `SdkApi` singleton pattern requires calling `resetSdkApi()` in test teardown. Forgetting this causes test pollution across files when run in the same worker.

---

## Phase 3: Headless Mode

**User stories**: 13, 14, 15, 16

### What to build

Add `headless: true` option to `init()`. When enabled, the SDK skips all UI rendering (no Shadow DOM, no launcher, no chat window) but initializes the full connection infrastructure: anonymous visitor session, WebSocket connection with auto-reconnect, and conversation lifecycle management. Expose `sendMessage(text)` as a public method that sends a message programmatically — in headless mode it auto-creates a conversation on first message (matching widget behavior). Expose `getConversation()` that returns the current conversation state (id, status, messages) or `null` if no active conversation. Both methods also work in widget mode for parity. `sendMessage()` returns a promise that resolves with the server-acknowledged message or rejects on error (rate limit, connection failure). All events from Phase 2 fire in headless mode (except `open`/`close` which are widget-only). The SDK connects the WebSocket eagerly in headless mode (no lazy connection — there's no "open chat" trigger).

### Acceptance criteria

- [ ] `init({ appId, headless: true })` initializes without rendering any DOM elements
- [ ] WebSocket connects eagerly in headless mode (no user interaction needed)
- [ ] `sendMessage(text)` sends a message and returns a promise resolving with the acknowledged message
- [ ] First `sendMessage()` call auto-creates a conversation if none exists
- [ ] `sendMessage()` rejects with clear error on rate limit or connection failure
- [ ] `getConversation()` returns `{ id, status, messages }` or `null`
- [ ] `message:received`, `message:sent`, `conversation:started`, `conversation:resolved`, `unread:changed`, `ready` events fire in headless mode
- [ ] `open()`, `close()`, `toggle()`, `hideWidget()`, `showWidget()` are no-ops in headless mode (no error)
- [ ] Auto-reconnect works identically to widget mode
- [ ] Unit tests for headless init path (no DOM created)
- [ ] Integration tests for headless message send/receive lifecycle
- [ ] Feature doc in `packages/sdk/docs/headless.md` covering headless mode behavior
- [ ] Branch: `feature/sdk-headless`

---

## Phase 4: Identity System (`identify()`)

**User stories**: 17, 18, 19, 20, 21

### What to build

Full-stack vertical slice for visitor identity enrichment. **Database**: create `visitorIdentities` table with Drizzle schema and migration. **API**: new `POST /api/v1/widget/identify` endpoint accepting `{ name?, email?, externalId?, metadata?, hmac? }`, authenticated via API key (same as other widget routes). Upserts a `visitorIdentities` record keyed on `(anonymousUserId, organizationId)`. When the tenant has HMAC verification enabled, validates `HMAC-SHA256(apiSecretKey, externalId)` and rejects unsigned calls. **Tenant settings**: add `identityVerificationEnabled` boolean to organization settings (or a dedicated column). **Admin dashboard**: add a toggle in tenant settings for identity verification. Display identity context (name, email, metadata) in the operator conversation view when available. **SDK**: implement `identify({ name?, email?, userId?, metadata?, hmac? })` method that calls the API endpoint. Works in both widget and headless modes. `identify()` is a no-op if called before `init()`. Multiple calls update (not duplicate) the identity record.

### Acceptance criteria

- [ ] `visitorIdentities` table created with correct schema, FK to `user`, unique constraint on `(anonymousUserId, organizationId)`
- [ ] Drizzle migration generated and applies cleanly
- [ ] `POST /api/v1/widget/identify` endpoint validates API key and upserts identity data
- [ ] HMAC verification rejects unsigned calls when tenant has verification enabled
- [ ] HMAC verification accepts correctly signed calls
- [ ] Unsigned `identify()` works when verification is disabled (default)
- [ ] Tenant dashboard has a toggle for identity verification in settings
- [ ] Operator conversation view shows visitor name, email, and metadata when available
- [ ] SDK `identify()` method calls the endpoint and resolves/rejects appropriately
- [ ] Multiple `identify()` calls update the same record (not create duplicates)
- [ ] `identify()` works in both widget and headless modes
- [ ] Unit tests for HMAC verification logic
- [ ] Integration tests for the identify endpoint (signed, unsigned, verification on/off)
- [ ] Feature doc in `packages/sdk/docs/identity.md` and `apps/hono-api/src/features/identity/docs/` covering the identity system
- [ ] Branch: `feature/sdk-identity`

---

## Phase 5: npm Publishing + SDK Documentation

**User stories**: 1, 2, 24, 25, 26, 27, 29

### What to build

Configure `packages/sdk/` for npm publishing as `@deliverychat/sdk`. Set up Vite lib-mode build producing ESM (`index.mjs`), CJS (`index.cjs`), and TypeScript declarations (`index.d.ts`). Configure `package.json` exports map for correct resolution in all bundlers. Verify tree-shaking: headless-only imports should not pull in widget UI code. Add bundle size tracking (CI check that the IIFE stays under a target size). Write comprehensive SDK documentation in `apps/docs` as a new `v1/sdk/` section: `quickstart.mdx` (zero-to-chat in 5 minutes, npm + CDN paths), `methods.mdx` (all methods with signatures and examples), `events.mdx` (all events with typed payloads and usage), `identity.mdx` (unsigned + HMAC flows, server-side examples for Node.js/Python/Ruby), `headless.mdx` (custom UI guide with reference implementation). Update existing `v1/chat-widget.mdx` to cross-link SDK docs for advanced usage.

### Acceptance criteria

- [ ] `packages/sdk/package.json` has correct `name` (`@deliverychat/sdk`), `exports`, `main`, `module`, `types` fields
- [ ] `bun run build --filter=sdk` produces ESM, CJS, and `.d.ts` output
- [ ] Tree-shaking verified: headless-only import excludes widget UI code from bundle
- [ ] IIFE build from `apps/widget/` still works and produces identical behavior
- [ ] Bundle size CI check configured (IIFE target ≤ threshold)
- [ ] `apps/docs/v1/sdk/quickstart.mdx` covers npm install + CDN script tag + basic init
- [ ] `apps/docs/v1/sdk/methods.mdx` documents all public methods with signatures and examples
- [ ] `apps/docs/v1/sdk/events.mdx` documents all events with typed payload examples
- [ ] `apps/docs/v1/sdk/identity.mdx` covers unsigned and HMAC-signed flows with server-side examples
- [ ] `apps/docs/v1/sdk/headless.mdx` includes a complete custom UI reference implementation
- [ ] Existing `v1/chat-widget.mdx` cross-links to SDK docs
- [ ] Feature doc in `packages/sdk/docs/publishing.md` covering build and distribution setup
- [ ] Branch: `feature/sdk-publishing`
