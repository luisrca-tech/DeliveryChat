# Conversation Filter Inference Registry

## Purpose

Centralizes all filter-tab derivation logic into two pure functions, eliminating three independent derivation paths that previously reimplemented the same mapping.

## Functions

### `inferFilterForAction(action, role) → FilterId`

Given a conversation lifecycle action (`accept`, `leave`, `resolve`) and the current user's role, returns the filter tab that should be active after the action completes.

| Action  | Admin/Super Admin | Operator |
| ------- | ----------------- | -------- |
| accept  | `all`             | `mine`   |
| leave   | `queue`           | `queue`  |
| resolve | `closed`          | `closed` |

### `inferFilterForConversation(conversation, role, userId) → FilterId`

Given a conversation's current state, returns the filter tab where that conversation would be visible. Used for deep-link/refresh scenarios where the URL has a `conversationId` but no `filter`.

| Status  | Admin/Super Admin | Operator (assigned) | Operator (not assigned) |
| ------- | ----------------- | ------------------- | ----------------------- |
| pending | `all`             | `queue`             | `queue`                 |
| active  | `all`             | `mine`              | `queue`                 |
| closed  | `closed`          | `closed`            | `closed`                |

## Consumers

- **`useConversationUrlFilterSync`** — calls `inferFilterForAction` when WebSocket lifecycle events arrive for the selected conversation.
- **`useInferMissingConversationFilterUrl`** — calls `inferFilterForConversation` when the URL has no filter param.
- **`useConversationActions`** — calls `inferFilterForAction` after mutation success for accept, leave, and resolve actions.

## Design decisions

- Both functions are pure with no React dependencies, making them exhaustively testable.
- `isAdminRole` from `conversationPermissions.ts` is the single source of truth for role checks.
- `conversationSearchNavigation.ts` is no longer imported by hooks or the URL sync layer. It remains in the codebase temporarily — Phase 3 will delete it when the unified action hook replaces the current action hooks.
