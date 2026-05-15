# Hook: useMessageHistory

Owns message state for the selected conversation: fetch, scroll, and the four message mutators consumed by `useWebSocketDispatch`.

## Responsibility

Replaces the `messages`/`loadingMsgs` state, the selectedId-driven fetch effect, the scroll-to-bottom effect, and the four stable `useCallback` mutators that previously lived inline in `ChatDemoIsland`.

## Owned state

| State            | Type                                | Purpose                                           |
| ---------------- | ----------------------------------- | ------------------------------------------------- |
| `messages`       | `OptimisticMessage[]`               | Current conversation messages, oldest-first       |
| `loadingMsgs`    | `boolean`                           | True while message fetch is in flight             |
| `messagesEndRef` | `RefObject<HTMLDivElement \| null>` | Attached to a sentinel div; scroll effect uses it |

## Exposed API

| Name              | Type                                            | Description                                               |
| ----------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `messages`        | `OptimisticMessage[]`                           | Message list for rendering                                |
| `setMessages`     | `Dispatch<SetStateAction<OptimisticMessage[]>>` | Passed to `useWebSocketDispatch` for reducer writes       |
| `loadingMsgs`     | `boolean`                                       | Show skeleton while loading                               |
| `messagesEndRef`  | `RefObject<HTMLDivElement \| null>`             | Attach to a div at the bottom of the message list         |
| `appendMessage`   | `(msg: OptimisticMessage) => void`              | Adds an optimistic message to the end                     |
| `replaceMessage`  | `(id, content, editedAt) => void`               | Updates content and editedAt by message id                |
| `removeMessage`   | `(id: string) => void`                          | Removes a message by id                                   |
| `rollbackMessage` | `(clientId: string) => void`                    | Removes an optimistic message by clientId on send failure |

## Behavior notes

- **Reversal**: `getMessages` returns newest-first; the hook reverses to oldest-first for display.
- **setLastMessageId**: Called with the last visible message after fetch, enabling missed-message sync on reconnect.
- **clearUnread**: Called after successful fetch to zero the unread badge for the selected conversation.
- **markAsRead**: Called on the client after fetch to persist the read position server-side.
- **Scroll**: A `useEffect` on `messages` scrolls the Radix scroll viewport to the bottom on every message list change.

## Test strategy

Tested with `renderHook` + mocked `ChatClient`. Covers: no-fetch when null, fetch+reversal, setLastMessageId call, clearUnread call, fetch failure, selectedId change, and all four mutators.
