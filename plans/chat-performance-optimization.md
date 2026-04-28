# Plan: Chat Performance Optimization — Message Flow & Conversation List

> Source PRD: `plans/prd-chat-performance-optimization.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **No schema changes**: All optimizations are internal. No new tables, columns, migrations, or API contracts.
- **No new routes**: Existing endpoints and WebSocket events remain unchanged.
- **Query consolidation strategy**: `validateSendAuthorization()` becomes the single source of conversation data for the entire message-send flow. It returns the fetched conversation row so downstream callers skip redundant SELECTs.
- **`updatedAt` semantics**: Only new messages bump `conversations.updatedAt`. Edits and deletes do not.
- **Optimistic update pattern**: Mutations use TanStack Query's `onMutate` → snapshot → optimistic cache write → `onError` rollback pattern. Server state is reconciled via `onSettled` invalidation.
- **Cache invalidation**: `invalidateQueries({ queryKey: conversationsQueryKeys.all() })` remains the mechanism for list refresh. No new query keys or refetch strategies.

---

## Phase 1: Backend Query Consolidation + `updatedAt` Bump

**User stories**: 1, 2, 10, 11

### What to build

Refactor the message-send hot path so that the conversation row is fetched exactly once. `validateSendAuthorization()` returns the conversation data it already queries (status, assignedTo, organizationId). `sendMessage()` receives this data as input instead of re-querying. The extra `assignedTo` fetch in the message handler is eliminated — it uses the data already available from validation.

After inserting the message, `sendMessage()` also updates `conversations.updatedAt = now()` so the conversation list (sorted by `DESC updatedAt`) reflects the most recent activity.

The total query count for the message-send hot path drops from 4-5 sequential queries to 2 (validation SELECT + message INSERT + updatedAt UPDATE batched together), or 3 for visitors (+ participant check).

### Acceptance criteria

- [x] `validateSendAuthorization()` returns the conversation row (status, assignedTo, organizationId) instead of void
- [x] `sendMessage()` accepts conversation data as an optional parameter and skips its own SELECT when provided
- [x] The extra `assignedTo` SELECT in the message handler is removed — broadcast payload uses data from validation
- [x] `sendMessage()` updates `conversations.updatedAt` to `now()` after inserting the message
- [ ] Sending a message via the widget causes the conversation to move to the top of the operator's list
- [x] Existing tests pass; new tests cover the `updatedAt` bump and the consolidated query path
- [x] Feature documentation added to the chat feature's `docs/` folder

---

## Phase 2: Decouple Read-Receipt from List Refresh

**User stories**: 3, 8

### What to build

In the WebSocket event handler for `message:new`, decouple the `markConversationAsRead()` HTTP call from the `invalidateQueries` call. Currently, `invalidateQueries` is chained inside `.then()` after the read-receipt completes, adding 50-200ms of delay before the conversation list refreshes.

Change this so `invalidateQueries` fires immediately when the event arrives (same as the non-active-conversation branch already does), and `markConversationAsRead()` runs as a fire-and-forget side effect.

### Acceptance criteria

- [x] `invalidateQueries` fires immediately on `message:new` regardless of whether the conversation is active
- [x] `markConversationAsRead()` still fires for the active conversation but does not block the list refresh
- [x] When viewing an active conversation and a new message arrives, the conversation list updates without waiting for the read-receipt round-trip
- [x] Unread counts still reset correctly when viewing an active conversation
- [x] Existing tests pass; new tests cover the decoupled flow

---

## Phase 3: Optimistic Updates for Operator Actions

**User stories**: 4, 5, 6, 9, 12

### What to build

Add optimistic cache updates to the three critical conversation mutations: accept, leave, and resolve. When the operator clicks the action button, the UI updates instantly by mutating the TanStack Query cache before the server responds.

Each mutation implements:
- `onMutate`: snapshot current cache, write optimistic state
- `onError`: rollback to snapshot
- `onSettled`: invalidate queries to reconcile with server state

Optimistic state changes:
- **Accept**: set `status: "active"`, `assignedTo: currentUserId`
- **Leave**: set `status: "pending"`, `assignedTo: null`
- **Resolve**: set `status: "closed"`

The current user's ID must be available to the mutation hooks (passed as a parameter or accessed from auth context).

### Acceptance criteria

- [x] Clicking Accept instantly moves the conversation from queue to active in the UI
- [x] Clicking Leave instantly moves the conversation from active back to queue in the UI
- [x] Clicking Resolve instantly removes the conversation from the active list in the UI
- [x] If the server returns an error, the UI rolls back to the previous state
- [x] The final server-reconciled state matches what the optimistic update predicted (no flicker)
- [x] Existing tests pass; new tests cover optimistic updates and rollback scenarios

---

## Phase 4: Instant Scroll + Cleanup

**User stories**: 7

### What to build

Change the message list auto-scroll from `behavior: "smooth"` to `behavior: "instant"`. The smooth animation adds 300-1000ms of perceived delay per new message, which is unacceptable for real-time chat.

### Acceptance criteria

- [x] New messages scroll into view instantly without animation
- [x] Rapid message delivery (multiple messages in quick succession) does not cause scroll jank
- [x] Manual scroll position is preserved when the user is reading history (no forced scroll-to-bottom)
