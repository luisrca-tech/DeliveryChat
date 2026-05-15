# Chat Demo Island — Architecture

`ChatDemoIsland.tsx` is a pure wiring file: it imports all hooks, passes values between them, and renders JSX. No business logic, no inline state management, no inline effects.

## Component structure

```
components/
  ChatDemoIsland.tsx      — hook wiring + top-level JSX (< 210 lines)
  ChatDemoComponents.tsx  — all display components (panels, badges)

hooks/
  useConversationList.ts  — conversations fetch, selectedId, new-form state
  useMessageHistory.ts    — message fetch, mutators, scroll ref
  useMessageEdit.ts       — inline edit/delete for visitor messages
  useMessageInput.ts      — send flow: optimistic append + ack
  useTypingIndicator.ts   — typing:start / typing:stop debounce
  useUnreadCounts.ts      — unread badge counts per conversation
  useVisitorUserId.ts     — captures visitorUserId from API response
  useLocalMessageSync.ts  — localStorage persistence of last-seen message id
  useEditWindowTicker.ts  — 30-second re-render for edit-window expiry
  useWebSocketConnection.ts — full WebSocket lifecycle per conversation
  useWebSocketDispatch.ts   — routes reducer events to state setters
  useWebSocketReconnect.ts  — exponential backoff reconnect scheduler
  useWebSocketHeartbeat.ts  — 30-second ping keepalive

lib/
  wsMessageReducer.ts     — pure function: (state, event) → {state, sideEffects}

visitor.ts                — resolveVisitorId(): reads/writes localStorage UUID
chat-client.ts            — createChatClient(): typed HTTP + WebSocket client
```

## Hook responsibilities (30-second navigation)

| Hook                     | Owns                                                           | Returns                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useConversationList`    | conversations fetch, selectedId, new-form state                | conversations, selectedId, setConversations, setSelectedId, loadingConvs, newForm, showNewForm, hideNewForm, setNewSubject, handleCreateConversation |
| `useMessageHistory`      | message fetch, scroll ref, message mutators                    | messages, setMessages, loadingMsgs, messagesEndRef, appendMessage, replaceMessage, removeMessage, rollbackMessage                                    |
| `useMessageEdit`         | inline edit/delete with 15-min window                          | editingState, handleStartEdit, handleCancelEdit, setEditingContent, handleSaveEdit, handleDelete                                                     |
| `useMessageInput`        | send flow + optimistic append                                  | value, sending, error, handleInputChange, handleSend                                                                                                 |
| `useTypingIndicator`     | typing:start / typing:stop debounce                            | notifyTyping, sendTypingStop                                                                                                                         |
| `useUnreadCounts`        | unread badge counts + read marking                             | unreadCounts, setUnreadCounts, clearUnread, refreshUnread                                                                                            |
| `useVisitorUserId`       | visitor user ID captured from first API response               | visitorUserId, captureVisitorId                                                                                                                      |
| `useLocalMessageSync`    | last-seen message ID per conversation in localStorage          | getLastMessageId, setLastMessageId                                                                                                                   |
| `useEditWindowTicker`    | 30-second interval re-render for edit-window expiry            | (no return value)                                                                                                                                    |
| `useWebSocketConnection` | full WebSocket lifecycle: token, connect, heartbeat, reconnect | wsRef, wsStatus, conversationClosedRef, selectedIdRef                                                                                                |
| `useWebSocketDispatch`   | routes reducer events → state setters + side effects           | handleWsMessage                                                                                                                                      |
| `useWebSocketReconnect`  | exponential backoff scheduler (1 s → 30 s cap)                 | scheduleReconnect, cancelReconnect                                                                                                                   |
| `useWebSocketHeartbeat`  | 30-second ping while socket is open                            | startHeartbeat, stopHeartbeat                                                                                                                        |

## Environment variables

| Variable            | Side   | Purpose                                   |
| ------------------- | ------ | ----------------------------------------- |
| `PUBLIC_API_URL`    | client | Base URL for all REST and WebSocket calls |
| `DEMO_CHAT_API_KEY` | server | Bearer token passed as prop to the island |
| `DEMO_CHAT_APP_ID`  | server | App UUID passed as prop to the island     |

Server-side vars are injected into props at request time. `client:only="react"` is used because the island needs `localStorage` and `WebSocket` — both browser-only APIs.

## Circular dependency resolution

`useWebSocketConnection` needs `handleWsMessage` from `useWebSocketDispatch`, which in turn needs `wsRef` from `useWebSocketConnection`. This is broken by `onMessageRef` — a stable ref in the island that is populated immediately after both hooks are created. `useWebSocketConnection` reads the ref indirectly, so it never creates a stale closure.
