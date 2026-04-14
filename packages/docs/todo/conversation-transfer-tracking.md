# Conversation Transfer Tracking & Participant Cleanup

## Problem

When an operator leaves a conversation (`POST /conversations/:id/leave`), two issues exist:

1. **Stale participant access**: The operator remains in `conversationParticipants` with `leftAt = NULL`, so `isParticipant()` still returns `true`. They can rejoin the WebSocket room for a conversation they no longer own.
2. **No transfer audit trail**: There is no record of who released a conversation, when, or how many times a conversation was transferred. This blocks operator performance analytics.

## Solution Overview

Two changes, independent but complementary:

### Part 1 — Set `leftAt` on leave

When an operator calls `POST /conversations/:id/leave`, set `leftAt = now()` on their `conversationParticipants` row.

**Files to modify:**

- `apps/hono-api/src/features/chat/chat.service.ts` — `leaveConversation()`

**Implementation:**

```ts
// Inside leaveConversation(), after the conversation update:
await db
  .update(conversationParticipants)
  .set({ leftAt: sql`now()` })
  .where(
    and(
      eq(conversationParticipants.conversationId, conversationId),
      eq(conversationParticipants.userId, operatorId),
      isNull(conversationParticipants.leftAt),
    ),
  );
```

**What this fixes:**
- `isParticipant()` already filters by `isNull(leftAt)` — no changes needed there.
- The operator can no longer `room:join` via WebSocket after leaving.

**Edge case — same operator re-accepts:**
Today `addParticipant()` in the accept route has a try/catch that silently ignores duplicates (unique constraint on `(conversationId, userId)`). After this change, the old row will have `leftAt` set, so inserting a new row would violate the unique constraint. Two options:

- **Option A (recommended):** Change `addParticipant` to do an upsert — if a row exists with `leftAt` set, clear `leftAt` instead of inserting. This reuses the same row.
- **Option B:** Drop the unique constraint and allow multiple rows per user per conversation. Each row represents a "session". More complex to query but preserves full history in this table.

Recommendation: Option A (upsert). Keep `conversationParticipants` as "current state" and use the transfers table (Part 2) for history.

### Part 2 — Create `conversationTransfers` table

An append-only audit log for conversation lifecycle transitions.

**Schema:**

```ts
// apps/hono-api/src/db/schema/conversationTransfers.ts

export const conversationTransferActionEnum = pgEnum(
  "delivery_chat_conversation_transfer_action",
  ["accepted", "released", "resolved"],
);

export const conversationTransfers = createTable("conversation_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  action: conversationTransferActionEnum("action").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

**Fields explained:**

| Field | Description |
|---|---|
| `conversationId` | The conversation being transferred |
| `userId` | The operator performing the action |
| `action` | What happened: `accepted` (took ownership), `released` (gave up), `resolved` (closed) |
| `createdAt` | When the action occurred |

**Why no `fromUserId`/`toUserId`?**
Each row logs a single actor's action. To find "who had it before", query the previous `accepted` row for the same conversation. This keeps the schema simple and avoids nullable fields.

**Files to create:**

- `apps/hono-api/src/db/schema/conversationTransfers.ts` — schema definition

**Files to modify:**

- `apps/hono-api/src/db/schema/index.ts` — re-export the new schema
- `apps/hono-api/src/db/schema/relations.ts` — add relations to `conversations` and `user`
- `apps/hono-api/src/db/schema/enums/index.ts` — export the new enum
- `apps/hono-api/src/routes/conversations.ts` — log a transfer on accept, leave, and resolve

**Route changes:**

```ts
// POST /:id/accept — after successful acceptConversation()
await db.insert(conversationTransfers).values({
  conversationId,
  userId: authUser.id,
  action: "accepted",
});

// POST /:id/leave — after successful leaveConversation()
await db.insert(conversationTransfers).values({
  conversationId,
  userId: authUser.id,
  action: "released",
});

// POST /:id/resolve — after successful resolveConversation()
await db.insert(conversationTransfers).values({
  conversationId,
  userId: authUser.id,
  action: "resolved",
});
```

**Migration:**

After creating the schema file, run:
```bash
bun run db:generate
bun run db:migrate
```

## Analytics Queries This Enables

Once the table is in place, these queries become trivial:

```sql
-- How many times was a conversation transferred?
SELECT conversation_id, COUNT(*) as transfers
FROM delivery_chat_conversation_transfers
WHERE action IN ('accepted', 'released')
GROUP BY conversation_id
ORDER BY transfers DESC;

-- Which operators release the most conversations?
SELECT user_id, COUNT(*) as releases
FROM delivery_chat_conversation_transfers
WHERE action = 'released'
GROUP BY user_id
ORDER BY releases DESC;

-- Average time an operator holds a conversation before releasing
SELECT
  t1.user_id,
  AVG(t1.created_at - t0.created_at) as avg_hold_time
FROM delivery_chat_conversation_transfers t1
JOIN delivery_chat_conversation_transfers t0
  ON t0.conversation_id = t1.conversation_id
  AND t0.user_id = t1.user_id
  AND t0.action = 'accepted'
  AND t1.action = 'released'
  AND t0.created_at < t1.created_at
GROUP BY t1.user_id;

-- Full timeline of a specific conversation
SELECT user_id, action, created_at
FROM delivery_chat_conversation_transfers
WHERE conversation_id = '<id>'
ORDER BY created_at ASC;
```

## Implementation Order

1. **Part 1 first** — set `leftAt` on leave + upsert on accept. This is a bug fix (security: stale access).
2. **Part 2 second** — create transfers table + log actions. This is a feature (analytics).
3. Both parts should have tests written before implementation (TDD per project convention).

## Test Scenarios

### Part 1

- Operator leaves → `leftAt` is set → `isParticipant()` returns `false`
- Same operator re-accepts → `leftAt` is cleared → `isParticipant()` returns `true`
- Different operator accepts → new participant row created, old operator still has `leftAt` set

### Part 2

- Accept creates a transfer record with `action = "accepted"`
- Leave creates a transfer record with `action = "released"`
- Resolve creates a transfer record with `action = "resolved"`
- Multiple transfers for same conversation produce correct timeline
