# WebSocket Handler Context

## Overview

All four WebSocket event handlers now receive a single `WebSocketHandlerContext` object instead of per-handler dependency types. This eliminates four separate deps types and enables a shared mock context for all handler tests.

## Before

Each handler defined its own deps type:

- `HandleMessageNewDeps` (6 fields)
- `HandleMessageEditedDeps` (2 fields)
- `HandleMessageDeletedDeps` (2 fields)
- `HandleConversationLifecycleDeps` (1 field)

`useWebSocket` constructed different deps objects for different handlers, leading to duplicated `messagesQueryKey` and `setQueryData` construction.

## After

A single `WebSocketHandlerContext` type in `types/chat.types.ts` contains the superset of all handler dependencies:

| Field                  | Used by                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `activeConversationId` | handleMessageNew                                            |
| `processedMsgIds`      | handleMessageNew                                            |
| `messagesQueryKey`     | handleMessageNew, handleMessageEdited, handleMessageDeleted |
| `invalidateQueries`    | handleMessageNew, handleConversationLifecycle               |
| `setQueryData`         | handleMessageNew, handleMessageEdited, handleMessageDeleted |
| `markAsRead`           | handleMessageNew                                            |

`useWebSocket` constructs the context object once per event and passes it to all handlers.

## Typing and Lifecycle Events

`typing:start` and `typing:stop` remain inline because they only touch React state — they have no cache interaction and don't benefit from the shared context.

The if-chain was converted to an if-else chain with a `Set`-based lookup for lifecycle events, improving clarity.

## Testing

A `webSocketHandlerContext.test.ts` file demonstrates that a single `createMockContext()` factory works for all four handlers. All existing handler tests were updated to use the shared context type.

## Files

| File                                    | Change                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `types/chat.types.ts`                   | Added `WebSocketHandlerContext` type                                           |
| `hooks/handleMessageNew.ts`             | Accepts `WebSocketHandlerContext` instead of `HandleMessageNewDeps`            |
| `hooks/handleMessageEdited.ts`          | Accepts `WebSocketHandlerContext` instead of `HandleMessageEditedDeps`         |
| `hooks/handleMessageDeleted.ts`         | Accepts `WebSocketHandlerContext` instead of `HandleMessageDeletedDeps`        |
| `hooks/handleConversationLifecycle.ts`  | Accepts `WebSocketHandlerContext` instead of `HandleConversationLifecycleDeps` |
| `hooks/useWebSocket.ts`                 | Constructs context once, passes to all handlers                                |
| `hooks/webSocketHandlerContext.test.ts` | Proves single mock context works for all handlers                              |
