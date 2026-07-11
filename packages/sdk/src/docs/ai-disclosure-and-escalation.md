# AI Disclosure & Human Escalation — Widget UX

Implements plan `plans/ai-database-connection-feature.md` §8. Bot disclosure is
a **legal requirement** (California B.O.T. Act; EU AI Act transparency), not a
polish item — this doc exists to make the compliance rationale explicit
alongside the implementation.

## AI message identity

- `ChatMessage.authorType?: "visitor" | "operator" | "ai" | "system"` mirrors
  the backend `message_author_type` enum. It is optional so payloads from
  before AI turns existed keep rendering exactly as before (backward compat).
- `MessageRouter` propagates `authorType` from `message:new` and
  `messages:sync` payloads without changing the existing `senderId`
  normalization (`null` → `""`).
- `MessageList.createBubble()` renders `authorType === "ai"` bubbles with an
  inline SVG avatar (`.message-ai-avatar`) and a label
  (`.message-ai-label`, defaults to "AI Assistant", overridable via
  `ctx.aiAssistantLabel` / `settings.ai.assistantLabel`). No external assets —
  the Shadow DOM CSP blocks remote fetches.

## AI typing indicator

The backend broadcasts `typing:start`/`typing:stop` for AI turns using the
sentinel `userId: "ai-assistant"` (`AI_ASSISTANT_USER_ID` in
`constants/index.ts`). The widget's typing subscriber in `widget.ts` checks
this sentinel and labels the indicator with the assistant label instead of
"Agent is typing...".

## "Talk to a human" button

Lives in the chat header (`components/HumanHandoffButton.ts`), inserted before
the close button in `ChatWindow.ts` — the header is the one chrome element
visible regardless of scroll position, which is what "persistent" (AC #4)
requires. A slim banner between the list and input was considered but rejected:
it would scroll out of view with the message list, defeating the "always
visible" requirement.

- Hidden when no conversation exists yet (`conversationId` is null).
- Disabled once already escalated (`state.humanRequested`) or once an operator
  message has arrived (`messages.some(m => m.authorType === "operator")`) —
  either signal means the visitor is already with, or queued for, a human.
- Click calls `SdkApi.requestHuman()` → `escalateConversation()`
  (`conversation.ts`), which `POST`s `/api/v1/conversations/:id/escalate`
  using the same `X-App-Id` / `X-Visitor-Id` header convention as every other
  widget REST call in this package. The server call is idempotent; the
  resulting system message and `handledBy` flip render through the normal
  `message:new` flow — no separate handling needed here.

## Opening AI disclosure line

When `settings.ai.enabled` is true (server-derived — see
`apps/hono-api/src/routes/widget.ts`, reusing
`features/ai-turn/resolveInitialHandledBy.ts`) and no conversation history
exists yet, `aiDisclosure.ts` seeds a single system-style message:

> "Hi! I'm {tenantName}'s {assistantLabel}. I can help you — or connect you to
> a person anytime."

`{tenantName}` comes from `settings.header.title`; `{assistantLabel}` from
`settings.ai.assistantLabel` (default "AI Assistant"). It's seeded client-side
in `widget.ts` `init()` and again in `SdkApi.startNewChat()` (fresh
conversation after "Start new chat"), reusing the existing `createSystemRow()`
rendering path — no new CSS or message-list branch needed.

## Takeover moment

**Client-side heuristic, not a server contract.** The first time an operator
message (`authorType === "operator"`) arrives in a conversation that already
had at least one AI message, `MessageRouter.handleMessageNew()` inserts a
synthetic system message — "You're now chatting with a team member." — right
before it, guarded by `state.aiTakeoverAnnounced` so it only ever renders once
per conversation. The server may later own this line (e.g. emit it directly
as part of the `handledBy` flip); if/when it does, this client-side insertion
should be removed to avoid a duplicate line.

## Settings shape

```ts
ai: {
  enabled: boolean;        // server-derived entitlement, not client-settable
  assistantLabel?: string; // display name override, defaults to "AI Assistant"
}
```

`defaultSettings.ai = { enabled: false, assistantLabel: "AI Assistant" }` in
`constants/index.ts`. `enabled` flows from `GET /widget/settings/:appId`
through `deepMergeWidgetSettings()`, which merges by iterating
`Object.keys(defaultSettings)` — `ai` had to be added there, not left as a
bare optional field, or the server value would be silently dropped.
