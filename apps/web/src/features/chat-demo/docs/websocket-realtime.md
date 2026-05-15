# Chat Demo — WebSocket Real-time (Phase 4)

## Overview

Phase 4 adds message sending, WebSocket-backed real-time delivery, and a connection status indicator to the chat demo island.

## Message Sending

Messages are sent via WebSocket `message:send` event (not HTTP POST). This provides:

- Lower latency (no separate HTTP round-trip)
- Native `message:ack` confirmation for optimistic UI replacement
- Single transport for both sending and receiving

### Optimistic UI

1. User presses Enter or clicks Send
2. A pending message (opacity-60) is appended immediately using a `clientMessageId` (UUID v4)
3. WebSocket sends `{ type: "message:send", payload: { conversationId, content, clientMessageId } }`
4. Server responds with `message:ack { clientMessageId, serverMessageId, createdAt }`
5. Pending message is replaced in-place with confirmed server data

If the WebSocket is not open, an inline error is shown and no optimistic message is added.

## WebSocket Lifecycle

On conversation select:

1. Previous WebSocket is closed (cleanup)
2. `POST /ws-token` fetches a signed JWT
3. `connectWebSocket(token)` opens `wss://<api-host>/v1/ws?token=<jwt>`
4. `room:join` is sent with the `conversationId`
5. Ping interval (30 s) is started

On conversation deselect or component cleanup: WebSocket is closed and ping interval is cleared.

## Server Events Handled

| Event                   | Action                                                      |
| ----------------------- | ----------------------------------------------------------- |
| `message:ack`           | Replace optimistic message with server ID + timestamp       |
| `message:new`           | Append incoming operator message to the list                |
| `conversation:accepted` | Update conversation status to `active`, set `assignedTo`    |
| `conversation:released` | Update conversation status to `pending`, clear `assignedTo` |
| `conversation:resolved` | Update conversation status to `closed`                      |

## Connection Status Indicator

A WiFi icon in the conversation header reflects WebSocket state:

- `connecting` — yellow pulsing WiFi icon
- `connected` — green WiFi icon
- `disconnected` — muted WifiOff icon

## Design Decisions

- **WS over HTTP POST for sending**: The plan originally mentioned `POST /messages` but `message:ack` only exists for WS-sent messages. Using WS for sending makes the optimistic UI and ack flow consistent.
- **`selectedIdRef`**: A ref mirrors the `selectedId` state so the `message:new` handler (a stable callback ref) can check the current conversation without being recreated on every selection change.
- **Duplicate message guard**: `message:new` handler checks `prev.some(m => m.id === id)` before appending to prevent duplicates if the server ever sends a message the client already has.
- **Closed conversation**: Input is disabled when `status === "closed"` — the API would reject it anyway.
