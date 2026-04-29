# Query Consolidation — Message Send Hot Path

## Overview

The message-send hot path was consolidated from 4 sequential conversation queries to a single validation query. `validateSendAuthorization()` now returns the conversation data it queries, which is reused by `sendMessage()` and the broadcast handler.

## Changes

| Function | Before | After |
|---|---|---|
| `validateSendAuthorization()` | Returns `void` | Returns `ConversationData` |
| `sendMessage()` | Always queries conversation | Accepts optional pre-fetched data |
| `handleMessageSend()` | Separate `assignedTo` fetch | Uses data from validation |

## `updatedAt` semantics

New messages bump `conversations.updatedAt`. Edits and deletes do not. This drives conversation list ordering (`DESC updatedAt`).
