# Chat Feature — Admin Dashboard

## Overview

Split-pane chat interface for real-time conversations between operators, admins, and visitors. Uses WebSocket for messaging and REST for CRUD operations.

## Architecture

### Data Flow
1. REST: `GET /conversations` → TanStack Query → Conversation list panel
2. REST: `GET /conversations/:id/messages` → TanStack Query → Message list
3. WS: `room:join` → Server → `message:new` events → Query cache update → Re-render
4. WS: `message:send` → Server → `message:ack` → Optimistic update confirmed

### WebSocket Connection
- Single connection per session via `useWebSocket` hook
- URL: `ws://<api>/v1/ws?tenant=<slug>&sessionToken=<bearer>`
- Reconnects automatically with exponential backoff
- Sends ping every 30s

### Key Hooks
| Hook | Purpose |
|------|---------|
| `useWebSocket` | Manages WS lifecycle, exposes `sendEvent`, `subscribe`, `isConnected` |
| `useConversationsQuery` | TanStack Query for conversation list with filter support |
| `useConversationMessagesQuery` | Paginated messages for a conversation |
| `useSendMessage` | Optimistic message sending with ACK handling |
| `useConversationMutations` | Create, close/archive, add participant mutations |
| `useConversationNotifications` | Toasts for `conversation:new` WS events |

### Components
- `ConversationsPage` — Top-level page, composes all panels
- `ConversationListPanel` — Left panel with filters and list
- `ChatPanel` — Center panel with header, messages, input + right participant panel
- `ParticipantPanel` — Collapsible right panel for participant management
- `CreateConversationDialog` — Create internal conversations
- `AddParticipantDialog` — Add participants (admin escalation)

## Conversation Flows
| Flow | Description |
|------|-------------|
| Visitor ↔ Operator | Operator selects support conversation, messages in real-time |
| Admin escalation | Admin added as participant to support conversation via ParticipantPanel |
| Internal | Admin creates conversation with operators, messages via WS |
