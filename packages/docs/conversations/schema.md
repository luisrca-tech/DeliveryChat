# Conversation & Message Schema

## Overview

The conversation system supports two types of chat within a multi-tenant context:
- **Support conversations** (`support`): visitor ↔ operator, initiated via the embedded widget
- **Internal conversations** (`internal`): operator ↔ operator/admin, for team communication

Visitors are **Better Auth anonymous users** — they share the same `user` table as operators and admins, distinguished by the `is_anonymous` flag. This unified model simplifies authentication, participation, and read tracking.

## Entity Relationship

```
organization (tenant)
  └── conversations (organization_id FK)
        ├── type: support | internal
        ├── application_id FK (nullable — null for internal chats)
        ├── messages (conversation_id FK)
        │     └── sender_id FK → user
        └── conversation_participants (conversation_id FK)
              ├── user_id FK → user
              ├── role: visitor | operator | admin
              └── last_read_message_id FK → messages (read status)
```

## Tables

### `delivery_chat_conversations`

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | random | Primary key |
| `organization_id` | text | no | — | Tenant isolation (FK → organization) |
| `application_id` | uuid | yes | — | Widget instance (FK → applications). Null for internal chats |
| `type` | enum | no | — | `support` or `internal` |
| `status` | enum | no | `active` | `active`, `closed`, or `archived` |
| `subject` | varchar(500) | yes | — | Title/topic for internal conversations |
| `closed_at` | timestamp | yes | — | When the conversation was closed |
| `created_at` | timestamp | no | now() | Creation time |
| `updated_at` | timestamp | no | now() | Last update time |

**Indexes:**
- `conversations_organization_idx` — tenant-scoped queries
- `conversations_application_idx` — widget-scoped queries
- `conversations_org_status_idx` — composite: active conversations per tenant
- `conversations_org_type_idx` — composite: filter by type per tenant

### `delivery_chat_messages`

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | random | Primary key |
| `conversation_id` | uuid | no | — | FK → conversations (cascade delete) |
| `sender_id` | text | no | — | FK → user (set null on delete). Can be anonymous or authenticated user |
| `type` | enum | no | `text` | `text` (regular message) or `system` (auto-generated) |
| `content` | text | no | — | Message body |
| `edited_at` | timestamp | yes | — | Set when message content is updated. `NULL` means never edited |
| `deleted_at` | timestamp | yes | — | Soft delete timestamp |
| `created_at` | timestamp | no | now() | Message send time |
| `updated_at` | timestamp | no | now() | Last edit time |

**Indexes:**
- `messages_conversation_idx` — all messages in a conversation
- `messages_conversation_created_idx` — composite: paginated history (cursor-based)
- `messages_sender_idx` — messages by user

### `delivery_chat_conversation_participants`

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | no | random | Primary key |
| `conversation_id` | uuid | no | — | FK → conversations (cascade delete) |
| `user_id` | text | no | — | FK → user (cascade delete) |
| `role` | enum | no | — | Role within this conversation: `visitor`, `operator`, or `admin` |
| `last_read_message_id` | uuid | yes | — | FK → messages (set null on delete). Tracks read status |
| `joined_at` | timestamp | no | now() | When the participant joined |
| `left_at` | timestamp | yes | — | When the participant left. Null = still active |

**Indexes:**
- `participants_conversation_idx` — who's in a conversation
- `participants_user_idx` — conversations for a user
- `participants_unique` — unique constraint on (conversation_id, user_id)

## Enums

| Enum | Postgres Type | Values |
|---|---|---|
| `conversationTypeEnum` | `conversation_type` | `support`, `internal` |
| `conversationStatusEnum` | `conversation_status` | `active`, `closed`, `archived` |
| `messageTypeEnum` | `message_type` | `text`, `system` |
| `participantRoleEnum` | `participant_role` | `visitor`, `operator`, `admin` |

## Better Auth Anonymous Plugin

The `user` table has an `is_anonymous` boolean column (default `false`). When a visitor opens the widget and starts chatting, an anonymous user is created via Better Auth's anonymous plugin. This gives visitors a real session with authentication — the same infra used by operators.

**Anonymous user flow:**
1. Widget calls `signIn.anonymous()` → Better Auth creates user with `is_anonymous: true`
2. Session cookie is set → visitor is authenticated
3. Visitor can create/join conversations and send messages
4. Optionally, the anonymous user can later link to a real account

**Email generation:** Anonymous users receive generated emails in the format `temp-{id}@anonymous.deliverychat.online`.

## Read Status Pattern

Read tracking uses the `last_read_message_id` column on `conversation_participants`. This is the Slack/Discord pattern:

- **Unread count** for a participant = count of messages in the conversation where `created_at > last_read_message.created_at`
- When a participant reads messages, update `last_read_message_id` to the latest message they've seen
- `NULL` means no messages have been read

This is more efficient than per-message read receipts (no extra table, no N×M rows) and sufficient for a support chat use case.

## Query Patterns

### Active conversations for a tenant
```sql
SELECT * FROM delivery_chat_conversations
WHERE organization_id = $1 AND status = 'active'
ORDER BY updated_at DESC;
-- Uses: conversations_org_status_idx
```

### Messages in a conversation (paginated)
```sql
SELECT * FROM delivery_chat_messages
WHERE conversation_id = $1 AND deleted_at IS NULL
ORDER BY created_at ASC
LIMIT 50;
-- Uses: messages_conversation_created_idx
```

### Unread count for a participant
```sql
SELECT COUNT(*) FROM delivery_chat_messages m
JOIN delivery_chat_conversation_participants p
  ON p.conversation_id = m.conversation_id
WHERE p.user_id = $1
  AND p.conversation_id = $2
  AND m.deleted_at IS NULL
  AND (p.last_read_message_id IS NULL OR m.created_at > (
    SELECT created_at FROM delivery_chat_messages WHERE id = p.last_read_message_id
  ));
```
