# Conversation Permissions

## Overview

`getConversationPermissions(role, conversation, userId)` is a pure function that consolidates all "can this user do X to this conversation?" checks into a single owner. Before this, every component computed its own `isAdmin`, `isAssigned`, `canManage`, etc. from raw role strings and conversation fields.

## API

```ts
import { getConversationPermissions, isAdminRole } from "../lib/conversationPermissions";

const permissions = getConversationPermissions(currentUserRole, conversation, userId);
// permissions.canResolve, permissions.canLeave, permissions.canAccept, etc.

const admin = isAdminRole(currentUserRole);
// true for "admin" or "super_admin"
```

## Return Shape

| Flag | Meaning |
|------|---------|
| `isAdmin` | Role is `admin` or `super_admin` |
| `isAssigned` | Conversation is assigned to the given `userId` |
| `canViewAll` | Can see the "All" filter (admin-only) |
| `canDelete` | Can delete conversations (admin-only) |
| `canAccept` | Can accept a pending conversation |
| `canLeave` | Can leave an active conversation they're assigned to |
| `canResolve` | Can mark an active conversation as solved |
| `canEditSubject` | Can edit the subject of an active conversation they're assigned to |
| `canSend` | Can send messages (staff must be assigned; visitors always can on active) |

## Design Decisions

- **Pure function, no React dependency**: Testable without rendering components. 35 unit tests cover all role/status/assignment combinations.
- **`isAdminRole()` helper**: Exported separately for contexts where no conversation exists yet (e.g., default filter selection on page load).
- **Components receive permissions as props**: `ChatHeader` takes `permissions: ConversationPermissions` instead of computing its own checks. `ChatPanel` computes permissions from the conversation detail and passes them down.
- **`ConversationListPanel` takes `isAdmin: boolean`**: Since it doesn't operate on a single conversation, it receives the pre-computed admin flag directly.

## Files Changed

- **Created**: `lib/conversationPermissions.ts`, `lib/conversationPermissions.test.ts`
- **Modified**: `ChatHeader.tsx`, `ChatPanel.tsx`, `ConversationListPanel.tsx`, `ConversationsPage.tsx`, `conversationSearchNavigation.ts`, `useInferMissingConversationFilterUrl.ts`
- **Updated tests**: `ChatHeader.test.tsx`
