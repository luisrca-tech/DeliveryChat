# WebSocket Message Reducer

**File:** `apps/web/src/features/chat-demo/lib/wsMessageReducer.ts`

## Purpose

`wsMessageReducer` is a pure function that maps a WebSocket event onto a new state slice. It has no side effects and no I/O — the same inputs always produce the same outputs.

## State Shape

```typescript
type WsReducerState = {
  messages: OptimisticMessage[]; // message list for the active conversation
  conversations: Conversation[]; // all visitor conversations
  operatorTypingName: string | null; // operator currently typing, null when idle
};
```

`OptimisticMessage` extends `Message` with:

- `clientId?: string` — temporary client-side ID used before server acknowledgement
- `pending?: boolean` — true while the server has not yet confirmed the message
- `sendError?: boolean` — true if the send attempt failed

## API

```typescript
function wsMessageReducer(
  state: WsReducerState,
  event: WsEvent, // { type: string; payload: Record<string, unknown> }
  selectedConversationId: string | null, // the currently open conversation
): WsReducerResult;
```

`WsReducerResult`:

```typescript
{ state: WsReducerState; sideEffects: WsReducerSideEffect[] }
```

## Event Transitions

| Event                    | State change                                                               | Side effects                              |
| ------------------------ | -------------------------------------------------------------------------- | ----------------------------------------- |
| `message:ack`            | Replaces optimistic message (by `clientId`) with the server message        | `persist-last-message`                    |
| `message:new` (selected) | Appends message; clears `operatorTypingName`                               | `persist-last-message`, `mark-as-read`    |
| `message:new` (other)    | No state change                                                            | `refresh-unread`                          |
| `messages:sync`          | Merges new messages; deduplicates                                          | `persist-last-message` (last new message) |
| `message:edited`         | Updates `content` and `editedAt` in place                                  | —                                         |
| `message:deleted`        | Removes message by ID                                                      | —                                         |
| `typing:start`           | Sets `operatorTypingName` (defaults to `"Operator"` if `userName` is null) | —                                         |
| `typing:stop`            | Clears `operatorTypingName`                                                | —                                         |
| `conversation:accepted`  | Sets `status: "active"`, updates `assignedTo`                              | —                                         |
| `conversation:released`  | Sets `status: "pending"`, clears `assignedTo`                              | —                                         |
| `conversation:resolved`  | Sets `status: "closed"`                                                    | `close-socket` (if selected)              |

Events for a conversation ID that does not match `selectedConversationId` are ignored for state changes (except `message:new` which emits `refresh-unread`, and `conversation:*` which update the conversation list regardless).

## Side-Effect Contract

The reducer never executes side effects. It returns them as values so the caller can decide when and how to run them.

| Side effect            | Caller responsibility                                                      |
| ---------------------- | -------------------------------------------------------------------------- |
| `persist-last-message` | `localStorage.setItem(lastMessageKey(conversationId), messageId)`          |
| `mark-as-read`         | `client.markAsRead(conversationId, messageId)`                             |
| `refresh-unread`       | `client.getUnreadCount(conversationId).then(setUnreadCounts)`              |
| `close-socket`         | Set `conversationClosedRef.current = true`, close and null `wsRef.current` |

## Immutability Contract

The reducer never mutates the input state. Arrays and objects in `state` are replaced, not modified in place. When no change is needed (e.g., duplicate message, wrong conversation ID), the original `state` reference is returned unchanged — callers can use reference equality checks (`next.messages !== prev.messages`) to avoid unnecessary re-renders.

## Usage in ChatDemoIsland

Phase 2 wires the reducer inline using a `wsSliceRef` (updated during render) to read the latest committed state in the async WS callback:

```typescript
const wsSliceRef = useRef({ messages, conversations, operatorTypingName });
wsSliceRef.current = { messages, conversations, operatorTypingName }; // updated every render

const handleWsMessage = useCallback((event) => {
  const { state: next, sideEffects } = wsMessageReducer(
    wsSliceRef.current,
    parsedEvent,
    selectedIdRef.current,
  );
  // Apply state + execute side effects
}, []);
```

Phase 4 will move this logic into a `useWebSocketDispatch` hook.
