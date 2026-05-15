# SdkApi Facade

## Overview

`SdkApi` is the single orchestration point for all SDK operations. It absorbs what was previously split across `chat-controller.ts` and the original thin `SdkApi` wrapper, consolidating connection lifecycle, message dispatch, conversation management, and the public developer API into one class.

## Dependency Graph

```
widget.ts ──> SdkApi
                ├── ConnectionEngine  (via ws.ts)
                ├── MessagePipeline   (via ws.ts)
                ├── EventBridge       (state → emitter subscriptions)
                ├── state.ts          (reactive store)
                ├── conversation.ts   (REST calls for history/read receipts)
                └── conversation-persistence.ts (localStorage)
```

`widget.ts` imports only from `SdkApi` for all actions. It still subscribes to `state.ts` for reactive UI updates (that's the view-binding layer), but all state mutations flow through `SdkApi` methods.

## Method Categories

### Public API (exposed via `window.DeliveryChat`)

| Method                             | Description                                                    |
| ---------------------------------- | -------------------------------------------------------------- |
| `open()`                           | Opens the chat window, connects WS lazily, resets unread count |
| `close()`                          | Closes the chat window                                         |
| `toggle()`                         | Toggles open/close                                             |
| `hideWidget()` / `showWidget()`    | Controls launcher visibility                                   |
| `sendMessage(text)`                | Sends a message, returns `Promise<ChatMessage>`                |
| `identify(params)`                 | Associates visitor with external identity                      |
| `getConversation()`                | Returns current conversation snapshot                          |
| `on(event, cb)` / `off(event, cb)` | Event subscription                                             |

### Internal Orchestration (used by widget.ts)

| Method                                       | Description                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `initChat({ appId })`                        | Initializes visitor, restores conversation history, connects WS if needed |
| `openChat()`                                 | Resets unread count, marks conversation as read, lazy WS connect          |
| `editMessage(id, content)`                   | Optimistic update + WS message                                            |
| `deleteMessage(id)`                          | Optimistic soft-delete + WS message                                       |
| `notifyTypingStart()` / `notifyTypingStop()` | Throttled typing indicators via WS                                        |
| `startNewChat()`                             | Resets conversation state and persistence                                 |
| `connectEagerly()`                           | Connects WS immediately (headless mode)                                   |
| `destroyChat()`                              | Full cleanup: pipeline, WS disconnect, persistence, state reset           |

## Singleton Pattern

`getSdkApi()` returns the singleton instance. `resetSdkApi()` destroys and nullifies it (used in tests). The instance tracks:

- `initialized` / `chatInitialized` — two-phase init (markInitialized + initChat)
- `headless` — disables UI-related methods
- `appId` — current tenant application
- `lastTypingSent` — throttle timestamp for typing indicators

## Design Decisions

- **No separate fire-and-forget `sendMessage`**: Widget calls `sdkApi.sendMessage(text).catch(() => {})`. The public API always returns a promise — consumers choose whether to await it.
- **state.ts remains accessible to widget.ts**: The `subscribe()` function is the view-binding mechanism. Moving all subscriptions through SdkApi would couple it to DOM rendering, violating separation of concerns.
- **Two-phase initialization**: `initChat()` sets up visitor/persistence/WS. `markInitialized()` enables the public API. Widget calls both; tests can call them independently.
