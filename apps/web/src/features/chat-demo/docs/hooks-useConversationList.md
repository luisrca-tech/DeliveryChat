# Hook: useConversationList

Owns all conversation-list state: initial fetch, selectedId, and the new-conversation form.

## Responsibility

Single hook that replaces the three `useState` calls for conversations/selectedId/loadingConvs, the consolidated new-form state, and the mount-time fetch effect that previously lived inline in `ChatDemoIsland`.

## Owned state

| State           | Type                             | Purpose                                               |
| --------------- | -------------------------------- | ----------------------------------------------------- |
| `conversations` | `Conversation[]`                 | All loaded conversations, newest-first after creation |
| `selectedId`    | `string \| null`                 | Currently viewed conversation                         |
| `loadingConvs`  | `boolean`                        | True while initial fetch is in flight                 |
| `newForm`       | `{ visible, subject, creating }` | Entire new-conversation form in one object            |

## Exposed API

| Name                       | Type                                       | Description                                                                   |
| -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| `conversations`            | `Conversation[]`                           | Conversation list                                                             |
| `setConversations`         | `Dispatch<SetStateAction<Conversation[]>>` | External setter — used by `useWebSocketDispatch` to prepend new conversations |
| `selectedId`               | `string \| null`                           | Currently selected conversation id                                            |
| `setSelectedId`            | `Dispatch<SetStateAction<string \| null>>` | Used by wiring layer on conversation select                                   |
| `loadingConvs`             | `boolean`                                  | Show skeleton while loading                                                   |
| `newForm`                  | `NewFormState`                             | Read-only form state for rendering                                            |
| `showNewForm`              | `() => void`                               | Opens the new-conversation form                                               |
| `hideNewForm`              | `() => void`                               | Closes and resets the form                                                    |
| `setNewSubject`            | `(subject: string) => void`                | Updates subject field                                                         |
| `handleCreateConversation` | `(e: React.FormEvent) => Promise<void>`    | Submit handler — calls client, prepends conversation, sets selectedId         |

## Test strategy

All behaviors tested with `renderHook` + mocked `ChatClient`. No real HTTP. Async behaviors use `waitFor`. Tests cover: initial state, successful fetch, fetch failure, form visibility toggling, conversation creation (happy path), and creation error.
