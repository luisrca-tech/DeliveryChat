# Plan: Chat Feature Architecture Deepening

> Source PRD: `plans/chat-architecture-deepening.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Location**: All changes are admin frontend only (`apps/admin/src/features/chat/`). No backend, schema, or API changes.
- **Permissions model**: `getConversationPermissions(role, conversation, userId)` is a pure function in `lib/conversationPermissions.ts`. Returns a flat object of booleans. Role comparison (`admin` / `super_admin`) happens exactly once, inside this function.
- **Filter inference model**: `inferFilterForAction(action, role)` and `inferFilterForConversation(conversation, role, userId)` are pure functions in `lib/conversationFilterInference.ts`. The existing `conversationSearchNavigation.ts` is deleted once the unified action hook consumes the registry.
- **Action hook interface**: `useConversationAction(type)` returns `{ execute(conversationId): Promise<boolean>, isPending }` — uniform for all action types. No caller-visible differences between accept, leave, resolve.
- **WebSocket handler context**: All handlers receive a single `WebSocketHandlerContext` object. Defined in `types/chat.types.ts`.
- **Testing**: Pure functions get exhaustive unit tests. Hooks get `renderHook` tests. Existing component test coverage must not regress.
- **Filter definitions**: The 4 filters (`all`, `queue`, `mine`, `closed`) in `constants/conversation-filters.ts` remain unchanged. `adminOnly` derivation moves to use the permissions function.

---

## Phase 1: Conversation Permissions ✅

**User stories**: 1, 2, 3, 15

### What to build

A pure function `getConversationPermissions(role, conversation, userId)` that returns all permission flags (`canResolve`, `canLeave`, `canAccept`, `canSend`, `canViewAll`, `canDelete`, `canEditSubject`). All components that currently compute permissions inline (`ChatHeader`, `ChatPanel`, `ConversationListPanel`) are refactored to call this function instead. The `adminOnly` flag on filter options is derived from the permissions function rather than hardcoded. Role comparison logic (`=== "admin" || === "super_admin"`) happens exactly once — inside this function.

### Acceptance criteria

- [ ] `getConversationPermissions` exists as a pure function with no React dependencies
- [ ] Unit tests cover all role × status × assignment combinations (operator assigned, operator not assigned, admin, super_admin × pending, active, closed)
- [ ] `ChatHeader`, `ChatPanel`, and `ConversationListPanel` use the permissions function instead of inline boolean expressions
- [ ] `adminOnly` on filter options is derived from `canViewAll`, not hardcoded
- [ ] No inline role comparisons remain in component files
- [ ] Existing component tests still pass

---

## Phase 2: Filter Inference Registry ✅

**User stories**: 8, 9, 16

### What to build

A pure function module that answers "which filter tab should be active?" for two scenarios: (1) after a conversation action — `inferFilterForAction(action, role)` returns a filter ID, and (2) for a given conversation state — `inferFilterForConversation(conversation, role, userId)` returns the appropriate filter. `useConversationUrlFilterSync` and `useInferMissingConversationFilterUrl` are refactored to call the registry instead of reimplementing the derivation logic. `conversationSearchNavigation.ts` is not deleted yet (Phase 3 will consume and replace it).

### Acceptance criteria

- [ ] `inferFilterForAction` and `inferFilterForConversation` exist as pure functions with no React dependencies
- [ ] Unit tests cover all action × role combinations and conversation state × role combinations
- [ ] `useConversationUrlFilterSync` calls the registry instead of inline derivation
- [ ] `useInferMissingConversationFilterUrl` calls the registry instead of its own logic
- [ ] The three previously-independent derivation paths now agree by construction (single source of truth)
- [ ] Existing navigation behavior is unchanged (verified by running the app)

---

## Phase 3: Unified Action Hook + Subject Editor ✅

**User stories**: 4, 5, 6, 7, 13, 14

### What to build

Two extractions that simplify `ChatHeader` and the action layer:

**Unified action hook**: `useConversationAction(type: "accept" | "leave" | "resolve")` with a uniform `{ execute(conversationId): Promise<boolean>, isPending }` interface. Internally resolves the correct mutation, optimistic update, toast message, and post-action filter navigation (using the Phase 2 registry). The `setActiveRoom` callback needed by accept is obtained from WebSocket context, not passed as a parameter. The three separate hooks (`useAcceptAction`, `useLeaveAction`, `useResolveAction`) are deleted. `conversationSearchNavigation.ts` is deleted — its navigation functions are replaced by the registry + a single `navigateToFilter` utility.

**Subject editor hook**: `useSubjectEditor(conversation)` returns `{ isEditing, draft, startEditing, cancelEditing, saveSubject, inputRef, isPending }`. Pure extraction of the editing state machine from `ChatHeader` lines ~35-66. `ChatHeader` becomes presentational for the subject section.

### Acceptance criteria

- [x] `useConversationAction` exists with uniform interface for accept, leave, and resolve
- [x] `useAcceptAction`, `useLeaveAction`, `useResolveAction` are deleted
- [x] `conversationSearchNavigation.ts` is deleted
- [x] Post-action navigation uses `inferFilterForAction` from the Phase 2 registry
- [x] `useSubjectEditor` exists and is tested with `renderHook` (editing, cancel, save, pending state)
- [x] `ChatHeader` subject section delegates entirely to `useSubjectEditor`
- [x] All callers of the old action hooks are migrated to `useConversationAction`
- [ ] Existing acceptance/leave/resolve behavior is unchanged (verified by running the app)

---

## Phase 4: WebSocket Handler Context

**User stories**: 10, 11, 12

### What to build

A shared `WebSocketHandlerContext` type that all WebSocket event handlers receive instead of custom per-handler dependency objects. The context includes `activeConversationId`, `processedMsgIds`, query key builders, a narrowed `queryClient` interface, and `markAsRead`. `useWebSocket.ts` constructs the context once and passes it to all handlers (`handleMessageNew`, `handleMessageEdited`, `handleMessageDeleted`, `handleConversationLifecycle`). Existing handler-specific deps types are removed. The event dispatch block in `useWebSocket` becomes a clean dispatch loop over a handler map.

### Acceptance criteria

- [x] `WebSocketHandlerContext` type is defined in `types/chat.types.ts`
- [x] All four handlers accept `WebSocketHandlerContext` as their dependency parameter
- [x] `useWebSocket.ts` constructs the context object once and passes it to all handlers
- [x] Handler-specific deps types are removed
- [x] A single mock `WebSocketHandlerContext` works for all handler tests
- [x] All existing handler tests pass with the new context interface
- [x] The event dispatch in `useWebSocket` uses an if-else chain with Set-based lifecycle lookup instead of scattered if blocks
