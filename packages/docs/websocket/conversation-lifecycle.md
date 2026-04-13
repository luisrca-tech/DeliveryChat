# Conversation Lifecycle

This document describes the full lifecycle of a support conversation, including the interplay between REST API calls and WebSocket broadcasts.

## State Machine

```
                         Visitor sends
                         first message
                              │
                              ▼
                     ┌────────────────┐
                     │    PENDING     │◄──── Operator releases
                     │  (in queue)    │      (conversation:released)
                     └───────┬────────┘
                             │
                    Operator accepts
               (conversation:accepted)
                             │
                             ▼
                     ┌────────────────┐
                     │    ACTIVE      │
                     │  (assigned)    │
                     └───────┬────────┘
                             │
                    Operator resolves
               (conversation:resolved)
                             │
                             ▼
                     ┌────────────────┐
                     │    CLOSED      │
                     │  (archived)    │
                     └────────────────┘
```

## Step-by-Step Flow

### 1. Conversation Creation (Visitor)

**Trigger:** Visitor sends their first message via the widget.

```
Widget                          REST API                        WebSocket
  │                               │                               │
  ├── POST /v1/widget/conversations ──►│                          │
  │   { content: "Hello..." }     │                               │
  │                               ├── Create conversation (pending)│
  │                               ├── Create message              │
  │                               ├── Add visitor as participant  │
  │                               │                               │
  │                               ├── broadcastToOrganization() ──►│
  │                               │   conversation:new            │ All staff see
  │◄── 201 { conversation, msg } ─┤                               │ new item in queue
```

**Database state after:**
- `conversations`: new row, `status=pending`, `assignedTo=null`
- `messages`: first message with `senderId=visitorId`
- `conversation_participants`: visitor added with `role=visitor`

### 2. Operator Accepts Conversation

**Trigger:** Operator clicks "Accept" in the admin dashboard queue.

```
Admin                           REST API                        WebSocket
  │                               │                               │
  ├── POST /v1/conversations/:id/accept ──►│                     │
  │                               │                               │
  │                               ├── UPDATE conversations        │
  │                               │   SET status='active',        │
  │                               │   assignedTo=operatorId       │
  │                               │   WHERE assignedTo IS NULL    │
  │                               │   (race-condition safe)       │
  │                               │                               │
  │                               ├── Add operator as participant │
  │                               │                               │
  │                               ├── broadcastToOrganization() ──►│
  │◄── 200 { conversation } ──────┤   conversation:accepted       │ Queue updates
  │                               │                               │ for all staff
  │                                                               │
  ├── room:join { conversationId } ──────────────────────────────►│
  │◄── messages:sync (missed messages) ──────────────────────────┤
```

**Race condition safety:** The `WHERE assignedTo IS NULL` clause ensures only one operator can accept a conversation, even if two click simultaneously.

### 3. Real-Time Messaging

**Trigger:** Either visitor or operator sends a message while the conversation is active.

```
Sender                          Server                          Receiver
  │                               │                               │
  ├── message:send ──────────────►│                               │
  │   { conversationId,           ├── Validate authorization     │
  │     content,                  ├── Save to DB (messages table) │
  │     clientMessageId }         │                               │
  │                               │                               │
  │◄── message:ack ──────────────┤                               │
  │   { clientMessageId,          ├── broadcast to room ─────────►│
  │     serverMessageId,          │   message:new                 │
  │     createdAt }               │   (excludes sender)           │
```

**Message authorization rules:**
- **Visitors:** Must be a participant of the conversation
- **Operators/Admins:** Must be the `assignedTo` user of the conversation

**Optimistic UI pattern:**
1. Client generates a `clientMessageId` (UUID) and shows the message as "sending"
2. Server persists, returns `message:ack` with the server-assigned `serverMessageId`
3. Client replaces the pending message ID with the confirmed server ID

### 4. Typing Indicators

```
Typer                           Server                          Other members
  │                               │                               │
  ├── typing:start ──────────────►│                               │
  │   { conversationId }          ├── broadcast to room ─────────►│
  │                               │   typing:start                │
  │                               │   { userId, userName, role }  │
  │   ... user pauses ...         │                               │
  │                               │                               │
  ├── typing:stop ───────────────►│                               │
  │   { conversationId }          ├── broadcast to room ─────────►│
  │                               │   typing:stop                 │
  │                               │   { userId }                  │
```

**Auto-clear:** Clients implement a 3-second timeout. If `typing:stop` is not received within 3 seconds of `typing:start`, the indicator is cleared automatically. This handles cases where the sender disconnects without sending an explicit stop.

### 5. Operator Releases Conversation

**Trigger:** Operator clicks "Leave Chat" — returns conversation to the pending queue.

```
Admin                           REST API                        WebSocket
  │                               │                               │
  ├── POST /v1/conversations/:id/leave ──►│                      │
  │                               │                               │
  │                               ├── UPDATE conversations        │
  │                               │   SET status='pending',       │
  │                               │   assignedTo=null             │
  │                               │                               │
  │                               ├── broadcastToOrganization() ──►│
  │◄── 200 ───────────────────────┤   conversation:released       │ Returns to
  │                               │                               │ operator queue
```

After release, any other operator can accept the conversation.

### 6. Operator Resolves Conversation

**Trigger:** Operator clicks "Mark as Solved" — closes the conversation.

```
Admin                           REST API                        WebSocket
  │                               │                               │
  ├── POST /v1/conversations/:id/resolve ──►│                    │
  │                               │                               │
  │                               ├── UPDATE conversations        │
  │                               │   SET status='closed',        │
  │                               │   closedAt=now()              │
  │                               │                               │
  │                               ├── broadcastToOrganization() ──►│
  │◄── 200 ───────────────────────┤   conversation:resolved       │ Removed from
  │                               │                               │ active lists
```

The widget receives `conversation:resolved` and updates the UI to show the conversation is closed. No more messages can be sent.

## Visibility Rules

| Role | Sees in Queue (pending) | Sees in Active | Can Accept |
|---|---|---|---|
| Visitor | N/A | Own conversation only | N/A |
| Operator | All pending conversations | Only assigned to them | Yes |
| Admin / Super Admin | All pending conversations | All active conversations | Yes |

## Reconnection & Message Sync

When a client disconnects and reconnects:

```
Client                          Server
  │                               │
  │  (connection lost)            │
  │  ... reconnect ...            │
  │                               │
  ├── (auto-authenticate) ───────►│
  ├── room:join                  ►│
  │   { conversationId,           │
  │     lastMessageId: "abc123" } │
  │                               ├── getMessagesSince("abc123")
  │◄── messages:sync ────────────┤
  │   { messages: [...missed] }   │
```

This ensures no messages are lost during brief disconnections. The `lastMessageId` acts as a cursor — the server returns all messages created after that message's timestamp.
