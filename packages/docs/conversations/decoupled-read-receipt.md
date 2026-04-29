# Decoupled Read-Receipt from List Refresh

## Overview

The conversation list refresh (`invalidateQueries`) is decoupled from the read-receipt HTTP call (`markConversationAsRead`) in the admin app's WebSocket `message:new` handler.

Previously, when a visitor message arrived in the active conversation, the list refresh was chained after the read-receipt completed, adding 50-200ms latency. Now both operations fire independently: the list refreshes immediately while the read-receipt runs as a fire-and-forget side effect.

## Behavior

| Scenario | List Refresh | Read Receipt |
|---|---|---|
| Visitor message in active conversation | Immediate | Fire-and-forget |
| Visitor message in other conversation | Immediate | Not called |
| Operator message (any conversation) | Immediate | Not called |

## Key Files

- `apps/admin/src/features/chat/hooks/handleMessageNew.ts` — Pure handler function with injected dependencies
- `apps/admin/src/features/chat/hooks/handleMessageNew.test.ts` — Unit tests
- `apps/admin/src/features/chat/hooks/useWebSocket.ts` — Hook that delegates to `handleMessageNew`
