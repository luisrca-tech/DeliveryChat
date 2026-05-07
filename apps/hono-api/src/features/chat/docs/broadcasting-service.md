# Broadcasting Service

## Overview

`broadcasting.service.ts` centralizes WebSocket event construction and broadcasting. Before this module, route files manually constructed `WSServerEvent` objects inline and called `roomManager.broadcastToOrganization()` with `JSON.stringify()` directly. Any change to an event shape required hunting down every callsite.

## Architecture

### Event Factory Functions

Pure functions that accept domain data and return a correctly typed `WSServerEvent`. One function per event type:

| Factory | Event type |
|---|---|
| `buildConversationNewEvent` | `conversation:new` |
| `buildMessageNewEvent` | `message:new` |
| `buildConversationAcceptedEvent` | `conversation:accepted` |
| `buildConversationReleasedEvent` | `conversation:released` |
| `buildConversationResolvedEvent` | `conversation:resolved` |
| `buildMessageEditedEvent` | `message:edited` |
| `buildMessageDeletedEvent` | `message:deleted` |
| `buildTypingStartEvent` | `typing:start` |
| `buildTypingStopEvent` | `typing:stop` |

### Broadcast Wrappers

Three functions that handle JSON serialization and delegate to the `roomManager` singleton:

- `broadcastOrganizationEvent(organizationId, event, excludeConnectionId?)` — `roomManager.broadcastToOrganization`
- `broadcastRoomEvent(conversationId, event, excludeConnectionId?)` — `roomManager.broadcast`
- `broadcastStaffEvent(organizationId, event, excludeConnectionId?)` — `roomManager.broadcastToStaff`

### Singleton Extraction

`room-manager-instance.ts` owns the `InMemoryRoomManager` singleton so both `routes/ws.ts` (which needs direct access for connection lifecycle) and `broadcasting.service.ts` (which needs it for broadcasts) can import it without a feature→route circular dependency.

## Callsite Migration

| File | Before | After |
|---|---|---|
| `routes/publicApi.ts` | imported `roomManager` from `./ws.js`, inline `WSServerEvent` | uses `buildConversationNewEvent`, `buildMessageNewEvent`, `broadcastOrganizationEvent` |
| `routes/widget.ts` | imported `roomManager` from `./ws.js`, inline `WSServerEvent` | uses `buildConversationNewEvent`, `broadcastOrganizationEvent` |
| `routes/conversations.ts` | imported `roomManager` from `./ws.js`, inline `WSServerEvent` | uses `buildConversationAcceptedEvent`, `buildConversationReleasedEvent`, `buildConversationResolvedEvent`, `broadcastOrganizationEvent` |
| `features/chat/chat.handlers.ts` | inline `WSServerEvent` construction | uses event factories; roomManager still passed as parameter for testability |

## Adding a New Event Type

1. Add the payload interface and event union member to `packages/types/src/ws-events.ts`
2. Add a factory function in `broadcasting.service.ts`
3. Call the factory and the appropriate broadcast wrapper at the callsite
