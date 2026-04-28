# WebSocket Event Handler Extraction

## Overview

Three inline cache-mutating event handlers were extracted from `useWebSocket`'s `onEvent` callback into pure, testable functions with dependency injection — following the same pattern established by `handleMessageNew` in Phase 2.

## Extracted Handlers

| Handler | Event | Behavior |
|---|---|---|
| `handleMessageEdited` | `message:edited` | Updates message content and `editedAt` in the messages cache |
| `handleMessageDeleted` | `message:deleted` | Marks message as deleted and clears content in the messages cache |
| `handleConversationLifecycle` | `conversation:new`, `conversation:accepted`, `conversation:released`, `conversation:resolved` | Fires `invalidateQueries` to refresh the conversation list |

## Dependency Injection Pattern

Each handler receives its dependencies as a typed object rather than importing them directly. This makes the handlers:

- **Pure**: no side effects beyond the injected functions
- **Testable**: mock the deps, assert the calls
- **Decoupled**: no dependency on React, TanStack Query, or the WebSocket layer

## Remaining Inline Handlers

The `typing:start` and `typing:stop` handlers remain inline in `useWebSocket` since they only touch local React state (`setTypingUser`) and have no cache interaction.

## Files

| File | Purpose |
|---|---|
| `hooks/handleMessageEdited.ts` | Extracted handler |
| `hooks/handleMessageEdited.test.ts` | 3 test cases |
| `hooks/handleMessageDeleted.ts` | Extracted handler |
| `hooks/handleMessageDeleted.test.ts` | 3 test cases |
| `hooks/handleConversationLifecycle.ts` | Extracted handler |
| `hooks/handleConversationLifecycle.test.ts` | 5 test cases |
