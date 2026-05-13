# Chat Client Module

## Purpose

`chat-client.ts` is the single module that owns all network I/O for the chat demo island. No component imports `fetch` or `new WebSocket(...)` directly — everything goes through this module.

## API

### `resolveVisitorId(): string`

Reads `dc_visitor_id` from `localStorage`. If absent, generates a UUID v4 with `crypto.randomUUID()`, persists it, and returns it. Subsequent calls within the same session return the same value. Clearing `localStorage` causes a new UUID to be generated on the next call.

### `createChatClient(options): ChatClient`

Factory that returns a typed client bound to `apiUrl`, `apiKey`, and `appId`. Every method automatically injects the required headers:

- `Authorization: Bearer <apiKey>`
- `X-App-Id: <appId>`
- `X-Visitor-Id: <resolved UUID>`
- `Origin: <window.location.origin>`

#### Methods

| Method | Endpoint |
|---|---|
| `getWsToken()` | `POST /api/ws-token` |
| `createConversation(subject?)` | `POST /api/conversations` |
| `listConversations(opts?)` | `GET /api/conversations` |
| `getConversation(id)` | `GET /api/conversations/:id` |
| `getMessages(conversationId, opts?)` | `GET /api/conversations/:id/messages` |
| `sendMessage(conversationId, content)` | `POST /api/conversations/:id/messages` |
| `editMessage(conversationId, messageId, content)` | `PATCH /api/conversations/:id/messages/:messageId` |
| `deleteMessage(conversationId, messageId)` | `DELETE /api/conversations/:id/messages/:messageId` |
| `markAsRead(conversationId, messageId)` | `POST /api/conversations/:id/read` |
| `getUnreadCount(conversationId)` | `GET /api/conversations/:id/unread` |
| `connectWebSocket(token)` | Opens `wss://<api-host>/v1/ws?token=<jwt>` |

## SDK future path

When the JavaScript SDK is built, it replaces this module. Components are unchanged because they only depend on the `ChatClient` type.
