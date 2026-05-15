# Plan: SDK Architecture Deepening

> Source: Architectural review of `packages/sdk/` after JavaScript SDK implementation (Phases 1-5)

## Architectural decisions

Durable decisions that apply across all phases:

- **Zero breaking changes**: Every phase preserves the existing public API surface (`init`, `destroy`, `open`, `close`, `toggle`, `hideWidget`, `showWidget`, `sendMessage`, `getConversation`, `identify`, `on`, `off`) and the `window.DeliveryChat` IIFE interface.
- **Test strategy**: Each refactored module gets boundary tests that replace scattered internal tests. Existing integration tests must continue passing — they serve as regression guardrails.
- **Module pattern**: Prefer class-based modules with explicit constructors over module-scoped singletons with global state. Classes are testable without reset functions and make dependency injection natural.
- **Package boundary**: All changes are within `packages/sdk/src/`. `apps/widget/` entry point should not need changes (it only imports from the public barrel export).
- **Event system contract**: The `EventEmitter<SdkEventMap>` interface and all 8 event types (`ready`, `open`, `close`, `message:received`, `message:sent`, `conversation:started`, `conversation:resolved`, `unread:changed`) are stable — internal wiring changes, but event names, payloads, and timing guarantees do not.

---

## Phase 1: Align Identity SDK Call with REST Client Convention ✅

**Candidate**: #4 (Identity Feature Isolation Gap)

### What to build

The `identify()` method in `SdkApi` currently makes an inline `fetch` call to `/api/v1/widget/identify`, bypassing the existing `api.ts` REST client that all other SDK→API interactions use. Move this call into `api.ts` as a proper client method, then have `SdkApi.identify()` delegate to it. This aligns the identity feature with the established HTTP call pattern, making it interceptable by the same mock/test infrastructure used for other API calls.

### Acceptance criteria

- [x] `api.ts` exposes `postIdentify()` method that handles the POST to `/widget/identify`
- [x] `SdkApi.identify()` delegates to `api.ts` instead of making a raw `fetch` call
- [x] All existing identity tests pass without modification
- [x] New unit tests for `postIdentify()` using the same mock pattern as other `api.ts` tests (5 tests)
- [x] `bun run check-types` passes for SDK package (pre-existing infisical/hono-api type errors are unrelated)
- [x] Feature doc updated in `packages/sdk/docs/identity.md` noting the client alignment

---

## Phase 2: Extract WebSocket Connection Engine ✅

**Candidate**: #1 (WebSocket God Module)

### What to build

Split `ws.ts` (455 lines, 15+ event types, 4 timers) into a deep `ConnectionEngine` module that hides connection lifecycle complexity behind a small interface. The engine owns: WebSocket creation/teardown, reconnection with backoff, ping/pong heartbeat, connection state tracking, and rate-limit enforcement. It exposes a minimal surface: `connect()`, `disconnect()`, `send(message)`, and an `onMessage(handler)` callback for dispatching received messages to the rest of the SDK.

A separate message router handles dispatching incoming WebSocket events to the appropriate state mutations and side effects. `PendingMessages.ts` is absorbed into the message router as an internal implementation detail (no longer a standalone module).

### Acceptance criteria

- [x] `ConnectionEngine` class/module exists with interface: `connect()`, `disconnect()`, `send()`, `onMessage()`, `onStateChange()`
- [x] All reconnection logic (backoff, max retries, timer management) is internal to the engine
- [x] Ping/pong heartbeat is internal to the engine
- [x] Rate-limit tracking is internal to the engine (via MessageRouter → markServerError callback)
- [x] Message router dispatches incoming events to state mutations and pending message resolution
- [x] `PendingMessages` functionality is absorbed into the message router (no standalone module)
- [x] Existing WebSocket integration tests pass (updated to test through new modules)
- [x] New boundary tests for `ConnectionEngine`: connect, disconnect, reconnect on error, reconnect backoff, ping timeout (19 tests)
- [x] New boundary tests for message router: dispatch by event type, pending message resolution/rejection/timeout (24 tests)
- [x] `bun run build --filter=widget` produces a working IIFE
- [x] Feature doc in `packages/sdk/docs/connection-engine.md`

---

## Phase 3: Unify Message Lifecycle Pipeline ✅

**Candidate**: #2 (Message Lifecycle Fragmentation)

### What to build

Message lifecycle is currently tracked across 4 modules: pending message promises (formerly `PendingMessages`), event emission via stateful closures in `EventBridge` (`prevMessageMap`, `pendingVisitorIds`), dispatch in `chat-controller`, and ACK handling in the message router. Consolidate into a single `MessagePipeline` module that owns the full send→optimistic-insert→ACK→event flow.

The pipeline accepts a message to send, creates the optimistic state entry, tracks the pending promise, processes the server ACK (or timeout/error), and emits the appropriate SDK events (`message:sent`, `message:received`). `EventBridge` no longer needs message-specific closure state — it continues handling non-message events (`conversation:started`, `conversation:resolved`, `unread:changed`, `ready`, `open`, `close`).

### Acceptance criteria

- [x] `MessagePipeline` module owns the complete send→ACK→event lifecycle
- [x] `sendMessage()` (both widget and headless paths) route through the pipeline — no dual code paths
- [x] `EventBridge` message tracking closures (`prevMessageMap`, `pendingVisitorIds`) are removed
- [x] `EventBridge` still handles all non-message events correctly
- [x] `message:sent` and `message:received` events fire with correct payloads and timing
- [x] Promise-based `sendMessage()` resolves/rejects correctly (ACK, timeout, error)
- [x] All existing message-related tests pass
- [x] New boundary tests for `MessagePipeline`: send→ACK happy path, send→timeout, send→error, receive from operator, concurrent sends (14 tests)
- [x] `bun run build --filter=widget` produces a working IIFE
- [x] Feature doc in `packages/sdk/docs/message-pipeline.md`

---

## Phase 4: Deepen SdkApi into True Facade

**Candidate**: #3 (SdkApi Thin Wrapper)

### What to build

`SdkApi` (127 lines) currently delegates almost 1:1 to `chat-controller` (359 lines), making it a shallow wrapper. `widget.ts` (554 lines) also reaches past `SdkApi` to import `chat-controller` directly. Absorb `chat-controller`'s orchestration logic into `SdkApi`, making it the single entry point for all SDK operations. `widget.ts` becomes a pure UI renderer that receives callbacks from `SdkApi` — it no longer imports state management, connection, or conversation modules directly.

After this phase, the dependency graph simplifies to: `widget.ts` → `SdkApi` → `ConnectionEngine` + `MessagePipeline` + `EventBridge` + `state`. No module bypasses `SdkApi` for orchestration.

### Acceptance criteria

- [ ] `chat-controller.ts` is removed — its logic lives in `SdkApi`
- [ ] `SdkApi` is the sole orchestration point for init, connection, conversation lifecycle, and message dispatch
- [ ] `widget.ts` imports only from `SdkApi` (no direct imports of state, connection, or conversation modules)
- [ ] `widget.ts` line count decreases — it handles only DOM rendering and UI event binding
- [ ] All existing integration and unit tests pass
- [ ] New boundary tests for `SdkApi`: full init→connect→send→receive→destroy lifecycle
- [ ] Headless mode and widget mode both route through the same `SdkApi` code paths
- [ ] `bun run build --filter=widget` produces a working IIFE
- [ ] Bundle size check passes (≤ 75 kB threshold)
- [ ] `bun run check-types` passes across the monorepo
- [ ] Feature doc in `packages/sdk/docs/facade.md` covering the simplified dependency graph
