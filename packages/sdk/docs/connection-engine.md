# Connection Engine

## Overview

The WebSocket connection lifecycle is managed by two dedicated modules extracted from the original monolithic `ws.ts`:

- **`ConnectionEngine`** — owns the WebSocket transport: creation, teardown, reconnection with exponential backoff, ping/pong heartbeat, and permanent vs. temporary error classification.
- **`MessageRouter`** — dispatches incoming WebSocket events to state mutations and manages pending message tracking (absorbed from the former standalone `PendingMessages` module).

## Architecture

```
chat-controller.ts
       │
       ▼
    ws.ts  (thin bridge — creates engine + router, wires callbacks)
    ┌───┴───┐
    ▼       ▼
ConnectionEngine    MessageRouter
    │                    │
    │  onMessage ────────┤
    │                    ├── message:new → state.messages
    │                    ├── message:ack → resolve pending promise
    │                    ├── message:edited/deleted → state.messages
    │                    ├── messages:sync → merge missing
    │                    ├── typing:start/stop → state.typingUser
    │                    ├── conversation:accepted/resolved/released → state.conversationStatus
    │                    ├── error (RATE_LIMITED) → state.rateLimited + reject pending
    │                    └── error (permanent) → markServerError → engine
    │
    ├── connect(config) → fetchWsToken → new WebSocket
    ├── disconnect()
    ├── send(message)
    ├── markServerError(code) — called by router on error events
    │
    └── Internal:
        ├── Exponential backoff reconnection (1s base, 30s cap)
        ├── Ping heartbeat every 25s
        └── Permanent error detection (UNAUTHORIZED, INVALID_TOKEN, APP_NOT_FOUND, close code 1008)
```

## ConnectionEngine Interface

| Method                  | Description                                                                    |
| ----------------------- | ------------------------------------------------------------------------------ |
| `connect(config)`       | Fetches a WS token via REST, opens the WebSocket, starts ping timer            |
| `disconnect()`          | Intentional close — stops ping, cancels reconnect, closes socket               |
| `send(message)`         | JSON-stringifies and sends if socket is open; silently drops otherwise         |
| `markServerError(code)` | Records the last server error code for permanent error classification on close |

### Callbacks (provided at construction)

- `onStateChange(status, error?)` — emitted on connection state transitions (`connecting`, `connected`, `disconnected`). The optional `error` carries permanent or temporary error info.
- `onMessage(event)` — every parsed JSON message from the server is forwarded here.

## MessageRouter Interface

| Method                                 | Description                                                         |
| -------------------------------------- | ------------------------------------------------------------------- |
| `handle(event)`                        | Dispatches a server event to the appropriate state mutation handler |
| `trackPendingMessage(clientMessageId)` | Returns a promise that resolves on ACK or rejects on timeout/error  |
| `clearAllPending()`                    | Rejects all tracked promises (called on SDK destroy)                |
| `cleanup()`                            | Clears internal timers (typing, rate-limit cooldown)                |

## Reconnection Strategy

1. On unexpected close, increment attempt counter
2. Compute delay: `min(1000 * 2^attempts, 30000)` ms
3. After 5 consecutive failures, emit a temporary error to the UI
4. On successful reconnect, reset attempt counter to 0
5. Permanent errors (invalid credentials, app not found) stop reconnection entirely

## PendingMessages Absorption

The standalone `PendingMessages.ts` module was absorbed into `MessageRouter`. The `chat-controller` now calls `getMessageRouter().trackPendingMessage()` instead of the standalone function. This co-locates pending promise resolution with the ACK handling that resolves them, eliminating the cross-module coupling.

## Backward Compatibility

`ws.ts` preserves the same public API (`connectWS`, `disconnectWS`, `sendWSMessage`) so `chat-controller.ts` required minimal changes (only the `PendingMessages` import swap). The `PendingMessages.ts` file is retained for now as it has its own test suite — it will be removed in a future cleanup once all consumers are verified.
