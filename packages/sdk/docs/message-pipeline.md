# MessagePipeline

The `MessagePipeline` module owns the complete message send-to-acknowledgement lifecycle. It consolidates logic that was previously fragmented across `PendingMessages`, `EventBridge` message closures, `chat-controller` dual send paths, and `MessageRouter` ACK handling.

## Responsibilities

| Concern | Before (Phase 2) | After (Phase 3) |
|---|---|---|
| Optimistic message insert | `chat-controller` (2 places) | `MessagePipeline.send()` |
| Conversation creation on first message | `chat-controller` (2 places) | `MessagePipeline.send()` |
| Pending promise tracking + timeout | `MessageRouter.trackPendingMessage()` | `MessagePipeline` (private) |
| ACK → state update + promise resolve | `MessageRouter.handleMessageAck()` | `MessagePipeline.processAck()` |
| `message:sent` event emission | `EventBridge` (prevMessageMap closure) | `MessagePipeline.processAck()` |
| `message:received` event emission | `EventBridge` (pendingVisitorIds closure) | `MessagePipeline.processIncoming()` |
| Pending rejection on error | `MessageRouter.rejectPendingMessage()` | `MessagePipeline.rejectPending()` |

## API

### `new MessagePipeline({ sendWS, emitter })`

- **sendWS**: `(event: object) => void` — sends a message through the WebSocket connection
- **emitter**: `EventEmitter<SdkEventMap>` — the SDK event emitter for `message:sent` and `message:received`

### `send(content, { appId, apiBaseUrl }): Promise<ChatMessage>`

Full send lifecycle:
1. Validates visitor state (initialized, not closed, not rate-limited)
2. Creates optimistic message with `status: "pending"`
3. Creates conversation via REST if none exists (+ `room:join` WS event)
4. Tracks pending promise with 15s timeout
5. Sends `message:send` WS event
6. Resolves when ACK arrives, rejects on timeout or error

### `processAck(payload): void`

Called by `MessageRouter` when a `message:ack` WS event arrives. Updates the message in state (client ID → server ID, pending → sent), emits `message:sent`, and resolves the pending promise.

### `processIncoming(msg): void`

Called by `MessageRouter` when a `message:new` WS event arrives for a non-duplicate message. Emits `message:received` for messages from non-visitor senders.

### `rejectPending(clientMessageId, error): void`

Rejects a specific pending message promise. Called by `MessageRouter` on server errors (rate limit, conversation not active).

### `clearAllPending(): void`

Rejects all pending promises with "SDK destroyed". Called during teardown.

## Dependency Flow

```
widget.ts / SdkApi
    └─► chat-controller.sendMessage() / sendMessageAsync()
            └─► MessagePipeline.send()
                    ├─► state (optimistic insert)
                    ├─► conversation.createConversation() (if needed)
                    └─► sendWS (message:send)

ConnectionEngine.onMessage
    └─► MessageRouter.handle()
            ├─► message:ack → MessagePipeline.processAck()
            ├─► message:new → MessagePipeline.processIncoming()
            └─► error → MessagePipeline.rejectPending()
```

## What Changed in EventBridge

`EventBridge` no longer subscribes to `messages` state. The `prevMessageMap` and `pendingVisitorIds` closures that tracked message state changes for `message:sent` and `message:received` events have been removed. EventBridge continues to handle: `open`, `close`, `ready`, `unread:changed`, `conversation:started`, `conversation:resolved`.
