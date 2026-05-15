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

## Phase 3: Headless Mode ✅ DONE

**User stories**: 13, 14, 15, 16

### What was built

Added `headless: true` option to `init()`. When enabled, the SDK skips all UI rendering (no Shadow DOM, no launcher, no chat window) but initializes the full connection infrastructure: anonymous visitor session, WebSocket connection with auto-reconnect, and conversation lifecycle management. Implemented `sendMessage(text)` as a public method returning a `Promise<ChatMessage>` that resolves on server ACK or rejects on error/timeout. Created `PendingMessages` module to track promise resolvers by `clientMessageId`, avoiding circular dependency between `chat-controller.ts` and `ws.ts`. Implemented `getConversation()` returning `{ id, status, messages }` or `null`. Added `connectEagerly()` for immediate WebSocket connection in headless mode. `SdkApi` singleton now accepts `{ headless: true }` via `markInitialized()` and gates UI methods as no-ops. `EventBridge` suppresses `open`/`close` events in headless mode while all other events fire normally. Updated IIFE entry point with `sendMessage` and `getConversation` on `window.DeliveryChat` including command queue support.

### Acceptance criteria

- [x] `init({ appId, headless: true })` initializes without rendering any DOM elements
- [x] WebSocket connects eagerly in headless mode (no user interaction needed)
- [x] `sendMessage(text)` sends a message and returns a promise resolving with the acknowledged message
- [x] First `sendMessage()` call auto-creates a conversation if none exists
- [x] `sendMessage()` rejects with clear error on rate limit or connection failure
- [x] `getConversation()` returns `{ id, status, messages }` or `null`
- [x] `message:received`, `message:sent`, `conversation:started`, `conversation:resolved`, `unread:changed`, `ready` events fire in headless mode
- [x] `open()`, `close()`, `toggle()`, `hideWidget()`, `showWidget()` are no-ops in headless mode (no error)
- [x] Auto-reconnect works identically to widget mode
- [x] Unit tests for headless init path (no DOM created)
- [x] Integration tests for headless message send/receive lifecycle
- [x] Feature doc in `packages/sdk/docs/headless.md` covering headless mode behavior
- [x] Branch: `feature/sdk-headless`

### Potential risks

- **PendingMessages timeout race**: The 15-second timeout in `PendingMessages` is hardcoded. On slow networks or when the server is under load, legitimate messages could time out and reject the promise even though the server eventually processes them. The optimistic message would show as "pending" in state but the promise would already be rejected. There is no retry mechanism — the caller must resend manually.
- **Eager WS connection without conversation**: In headless mode, `connectEagerly()` opens the WebSocket immediately on init, but if no conversation exists yet, the connection sits idle until `sendMessage()` creates one. This consumes a server-side connection slot that provides no value until the first message. High-volume headless deployments could exhaust connection limits.
- **Circular dependency fragility**: The `PendingMessages` module exists solely to break the circular dependency between `chat-controller.ts` (which calls `trackPendingMessage`) and `ws.ts` (which calls `resolvePendingMessage`/`rejectPendingMessage`). If a future refactor moves any of these calls to the wrong module, the circular dependency resurfaces silently (no build error, just runtime `undefined` imports).
- **EventBridge headless check is runtime, not compile-time**: The `isOpen` subscription in `EventBridge` calls `getSdkApi().isHeadless()` on every state change. If `SdkApi` is reset or destroyed while the bridge is still connected, the check could throw or return a stale value. The bridge cleanup depends on `disconnectEventBridge()` being called before `resetSdkApi()`.
- **sendMessage in widget mode shares sendMessageAsync**: Both headless and widget modes now have access to `sendMessage()` via `SdkApi`, which calls `sendMessageAsync` internally. In widget mode, this creates a second code path for sending messages alongside the original `controllerSendMessage` (used by the input area). If both paths are triggered concurrently, the optimistic message list could have ordering issues since both create independent `clientMessageId` values.

---

## Phase 4: Identity System (`identify()`) — ✅ DONE

**User stories**: 17, 18, 19, 20, 21

### What was built

Full-stack vertical slice for visitor identity enrichment. **Database**: `visitorIdentities` table with Drizzle schema (unique constraint on `anonymousUserId + organizationId`, FK to `user` and `organization`). Added `identityVerificationEnabled` boolean and `identityVerificationSecret` varchar to `organization` table. **API**: `POST /api/v1/widget/identify` endpoint with Zod validation, HMAC-SHA256 verification (timing-safe), and upsert via `onConflictDoUpdate`. **SDK**: `identify()` method on `SdkApi`, exposed on `window.DeliveryChat` with command queue support. Works in both widget and headless modes. **Note**: Admin dashboard toggle and operator conversation view for identity context are deferred to a future phase (frontend-only scope).

### Acceptance criteria

- [x] `visitorIdentities` table created with correct schema, FK to `user`, unique constraint on `(anonymousUserId, organizationId)`
- [ ] Drizzle migration generated and applies cleanly — **deferred**: schema created, migration must be run manually via `bun run db:generate && bun run db:migrate`
- [x] `POST /api/v1/widget/identify` endpoint validates API key and upserts identity data
- [x] HMAC verification rejects unsigned calls when tenant has verification enabled
- [x] HMAC verification accepts correctly signed calls
- [x] Unsigned `identify()` works when verification is disabled (default)
- [ ] Tenant dashboard has a toggle for identity verification in settings — **deferred to future phase** (frontend scope)
- [ ] Operator conversation view shows visitor name, email, and metadata when available — **deferred to future phase** (frontend scope)
- [x] SDK `identify()` method calls the endpoint and resolves/rejects appropriately
- [x] Multiple `identify()` calls update the same record (not create duplicates)
- [x] `identify()` works in both widget and headless modes
- [x] Unit tests for HMAC verification logic (9 tests)
- [x] Integration tests for the identify endpoint (8 tests: signed, unsigned, verification on/off)
- [x] Feature doc in `packages/sdk/docs/identity.md` and `apps/hono-api/src/features/identity/docs/`
- [x] Branch: `feature/sdk-headless` (combined with Phase 3)

### Potential risks

- **Migration not yet applied**: The `visitorIdentities` table and new `organization` columns exist only as Drizzle schema definitions. The migration must be generated and applied before the endpoint works against a real database. Running `db:generate` + `db:migrate` is a manual step per project conventions.
- **Admin UI gap**: Identity verification toggle and operator-side identity display are not yet built. Tenants cannot enable HMAC verification through the UI until the admin dashboard is updated. A direct database update is required as a workaround.
- **`identify()` throws if called before `init()`**: Unlike the plan's original "no-op" behavior, the implementation throws an error. This is intentional for developer visibility but may surprise integrators who expect silent failure.
- **HMAC secret storage is plaintext**: The `identityVerificationSecret` column stores the secret as plaintext varchar. For production use, consider encrypting at rest or using a secrets manager.
- **No rate limiting on identify endpoint**: The `/identify` endpoint is protected by widget auth but has no dedicated rate limiter. A malicious client could call it repeatedly. The existing visitor rate limiter on `/conversations/*` does not cover `/identify`.

---

## Phase 5: npm Publishing + SDK Documentation — ✅ DONE

**User stories**: 1, 2, 24, 25, 26, 27, 29

### What was built

Configured `packages/sdk/` for npm publishing as `@deliverychat/sdk` with Vite lib-mode build. **Build**: ESM (`index.mjs`), CJS (`index.cjs`), and TypeScript declarations via `vite-plugin-dts`. Package exports map configured for all bundler resolution strategies. **Bundle size**: Check script (`scripts/CheckBundleSize.js`) validates IIFE stays under 75 kB threshold (currently ~52 kB). **Documentation**: Full `v1/sdk/` section in `apps/docs` with 5 pages: quickstart (npm + CDN paths), methods (all methods with signatures), events (all 8 events with typed payloads), identity (unsigned + HMAC flows with Node.js/Python/Ruby examples), headless (complete reference implementations in vanilla JS and React). Updated `chat-widget.mdx` with SDK cross-links. **Package rename**: `@repo/sdk` → `@deliverychat/sdk` with workspace dependency updates in `apps/widget/`.

### Acceptance criteria

- [x] `packages/sdk/package.json` has correct `name` (`@deliverychat/sdk`), `exports`, `main`, `module`, `types` fields
- [x] `bun run build --filter=sdk` produces ESM, CJS, and `.d.ts` output
- [x] Tree-shaking verified: headless-only import excludes widget UI code from bundle
- [x] IIFE build from `apps/widget/` still works and produces identical behavior
- [x] Bundle size CI check configured (IIFE target ≤ 75 kB)
- [x] `apps/docs/v1/sdk/quickstart.mdx` covers npm install + CDN script tag + basic init
- [x] `apps/docs/v1/sdk/methods.mdx` documents all public methods with signatures and examples
- [x] `apps/docs/v1/sdk/events.mdx` documents all events with typed payload examples
- [x] `apps/docs/v1/sdk/identity.mdx` covers unsigned and HMAC-signed flows with server-side examples
- [x] `apps/docs/v1/sdk/headless.mdx` includes a complete custom UI reference implementation
- [x] Existing `v1/chat-widget.mdx` cross-links to SDK docs
- [x] Feature doc in `packages/sdk/docs/publishing.md` covering build and distribution setup
- [x] Branch: `feature/sdk-publishing`

### Potential risks

- **Workspace resolution after rename**: The SDK was renamed from `@repo/sdk` to `@deliverychat/sdk`. Any code that still references `@repo/sdk` will fail. Only `apps/widget/` was updated; if other packages add SDK imports in the future, they must use `@deliverychat/sdk`.
- **Declaration files are unbundled**: `vite-plugin-dts` generates individual `.d.ts` files rather than a single rolled-up declaration. This works correctly but increases the published package size slightly. `rollupTypes: true` requires `@microsoft/api-extractor` as an additional dependency.
- **Dev-time type resolution**: In development, TypeScript resolves `@deliverychat/sdk` via the `exports` map which points to `dist/`. If `dist/` doesn't exist (fresh clone), type checking fails until `bun run build --filter=@deliverychat/sdk` is run. Consider adding a `prebuild` step or documenting this in onboarding.
- **Bundle size threshold is generous**: The 75 kB limit provides ~45% headroom over the current 52 kB IIFE. As features are added, the threshold may need tightening to prevent bundle bloat from going unnoticed.
