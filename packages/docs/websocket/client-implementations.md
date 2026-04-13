# Client Implementations

Two independent WebSocket clients connect to the same server endpoint (`/v1/ws`) with different authentication strategies and state management approaches.

## Admin Dashboard Client

**Files:**
- `apps/admin/src/features/chat/lib/ws.client.ts` — WebSocketManager class
- `apps/admin/src/features/chat/hooks/useWebSocket.ts` — React hook
- `apps/admin/src/features/chat/hooks/useConversationNotifications.ts` — Notification handler

### WebSocketManager

A singleton class managing the WebSocket connection lifecycle for the admin dashboard.

```typescript
class WebSocketManager {
  private ws: WebSocket | null;
  private activeRoom: { conversationId: string; lastMessageId?: string } | null;
  private pingTimer: NodeJS.Timer;        // 30s heartbeat
  private reconnectTimer: NodeJS.Timer;   // Exponential backoff

  connect(): void;                        // Open WS connection
  disconnect(): void;                     // Close + cleanup timers
  send(event: WSClientEvent): void;       // Send typed event
  setActiveRoom(convId, lastMessageId?, force?): void;  // Join/switch rooms
  get isConnected(): boolean;
}
```

**Connection URL:**
```
wss://{apiBaseUrl}/v1/ws?tenant={slug}&sessionToken={token}
```

**Key behaviors:**
- **Single active room:** Only one conversation room is active at a time. Calling `setActiveRoom()` sends `room:leave` for the current room and `room:join` for the new one.
- **Heartbeat:** Sends `ping` every 30 seconds to keep the connection alive.
- **Auto-reconnect:** On unexpected disconnect, reconnects with exponential backoff (1s, 2s, 4s, ... up to 30s max).
- **Event bus:** Uses an internal `EventTarget` for pub/sub — React hooks subscribe to events.

### useWebSocket Hook

The primary React integration point. Manages subscriptions and exposes a clean API:

```typescript
function useWebSocket(activeConversationId: string | null): {
  isConnected: boolean;
  sendEvent: (event: WSClientEvent) => void;
  subscribe: (handler: (event: WSServerEvent) => void) => () => void;
  setActiveRoom: (convId: string, lastMessageId?: string, force?: boolean) => void;
  typingUser: TypingUser | null;
}
```

**TanStack Query integration:**
The hook listens to server events and updates the query cache directly:

| Server Event | Query Cache Action |
|---|---|
| `message:new` | Prepend message to conversation messages query |
| `conversation:new` | Invalidate conversations list query |
| `conversation:accepted` | Invalidate conversations list query |
| `conversation:released` | Invalidate conversations list query |
| `conversation:resolved` | Invalidate conversations list query |
| `typing:start` | Set local `typingUser` state (3s timeout) |
| `typing:stop` | Clear `typingUser` state |

This pattern avoids polling — the query cache is updated in real-time via WebSocket events, keeping the UI reactive without unnecessary network requests.

### useConversationNotifications Hook

Handles browser notifications and sound alerts for new conversations:

- Plays a notification sound when `conversation:new` is received
- Shows a browser notification if the tab is not focused
- Respects user notification preferences

---

## Widget Client

**Files:**
- `apps/widget/src/widget/ws.ts` — Standalone WebSocket client
- `apps/widget/src/widget/state.ts` — Global state management
- `apps/widget/src/widget/types.ts` — Type definitions

### Connection API

```typescript
function connectWS(cfg: {
  apiBaseUrl: string;
  appId: string;
  visitorId: string;
}): void;

function sendWSMessage(event: object): void;
function disconnectWS(): void;
```

**Connection URL:**
```
ws[s]://{apiBaseUrl}/v1/ws?appId={appId}&visitorId={visitorId}
```

Protocol is inferred from the API base URL: `https` → `wss`, `http` → `ws`.

### State Management

The widget uses a custom subscription-based state system (no React state for the WS layer):

```typescript
type State = {
  connectionStatus: "disconnected" | "connecting" | "connected";
  messages: ChatMessage[];
  conversationId: string | null;
  conversationStatus: "pending" | "active" | "closed";
  typingUser: TypingUser | null;
  // ... other UI state
};

// Subscribe to specific state keys
const unsubscribe = subscribe("messages", (messages) => {
  // Re-render message list
});

// Update state (triggers subscriptions)
setState("connectionStatus", "connected");
```

### Server Event Handling

| Server Event | State Update |
|---|---|
| `message:new` | Append to `messages`, clear `typingUser` if sender was typing |
| `message:ack` | Replace pending message's `clientMessageId` with `serverMessageId` |
| `messages:sync` | Append synced messages to `messages` array |
| `typing:start` | Set `typingUser` with 3s auto-clear timeout |
| `typing:stop` | Clear `typingUser` |
| `conversation:accepted` | Set `conversationStatus` to `"active"` |
| `conversation:resolved` | Set `conversationStatus` to `"closed"` |
| `conversation:released` | Set `conversationStatus` to `"pending"` |
| `error` | Clear stale persistence if conversation not found |

### Key Behaviors

- **Heartbeat:** 25 seconds (slightly shorter than admin to account for widget network conditions)
- **Auto-reconnect:** Exponential backoff on unexpected disconnect
- **Optimistic messages:** Messages appear immediately with a local `clientMessageId`, then get confirmed via `message:ack`
- **Typing timeout:** 3-second auto-clear if no explicit `typing:stop` received
- **Error recovery:** If the server returns `CONVERSATION_NOT_FOUND`, the widget clears stale conversation state from local persistence

---

## Comparison

| Feature | Admin Client | Widget Client |
|---|---|---|
| Auth method | Session token + tenant slug | appId + visitorId |
| State management | TanStack Query cache | Custom subscription state |
| Room switching | Yes (single active room) | No (one conversation per visitor) |
| Heartbeat interval | 30s | 25s |
| Reconnect strategy | Exponential backoff (max 30s) | Exponential backoff |
| Notifications | Browser notifications + sound | N/A (widget is already visible) |
| Multi-tab support | Yes (multiple connections tracked server-side) | N/A |
| Typing indicators | Send + receive | Send + receive |
| Message sync | Via `lastMessageId` on room join | Via `lastMessageId` on room join |
