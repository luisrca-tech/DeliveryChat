# Human handoff in the demo chat

## Why this exists

The marketing demo (`ChatDemoIsland`) is a **bespoke client**. It calls the same
`/api/v1/widget` endpoints as the real widget but shares no UI code with
`@deliverychat/sdk`. That's why it originally had no "Talk to a human" button —
not a plan gate, not a developer opt-in, just UI the demo never implemented.

The gap mattered because escalation is a selling point the demo couldn't
demonstrate. AI auto-replies and _automatic_ escalations already worked here,
because the AI turn is triggered **server-side** when a visitor message arrives
— it doesn't care which client sent it. Only the manual, visitor-initiated
escalation was missing.

## Shape

| Piece                               | Responsibility                                                         |
| ----------------------------------- | ---------------------------------------------------------------------- |
| `lib/handoffOffer.ts`               | Pure rule: `{ hidden, disabled }` from conversation state              |
| `hooks/useHumanHandoff.ts`          | AI-entitlement fetch, per-conversation request flag, the escalate call |
| `components/ChatDemoComponents.tsx` | Renders the header button and the error row                            |

The rule is pure and separately tested so the escalation-offer invariant can be
asserted without React, a fetch, or a DOM.

## The rules

**Hidden** when AI is off for the application, or before a conversation is
selected. Without AI there is nothing to escalate _from_ — the visitor is
already queued for humans, so offering to connect them to one is noise.

**Disabled** once the visitor has already requested a human, once an operator
has spoken, or once the conversation is closed. Each means the click would be a
server-side no-op or a 409.

`aiEnabled` comes from `GET /widget/settings/:appId` → `ai.enabled`, which the
API derives from the _full_ entitlement (plan + add-on + `aiEnabled` +
`aiAutoRespond`). The demo never decides this locally, so it cannot offer an
affordance the backend would reject.

## Duplication with the SDK — deliberate, and a liability

This mirrors `handoffOffer` in
`packages/sdk/src/aiConversationLifecycle.ts`. The two are **not** shared:
`apps/web` does not depend on `@deliverychat/sdk`, and adding a workspace
dependency for one pure function was judged heavier than the duplication.

The rules differ only where the data models differ. The SDK tags messages with
`authorType`; the demo's `Message` has no such field, so an operator is inferred
as "a non-system message from someone other than this visitor". The demo also
adds a closed-conversation check the SDK handles elsewhere.

**If the escalation-offer invariant changes in the SDK, change it here too.**
If this drifts more than once, that's the signal to extract it into a shared
package instead.

## Notes

- Escalation is **idempotent** server-side, so a double click is harmless.
- The hook deliberately synthesises **no** local message. The system message and
  the status flip arrive over the normal WebSocket flow, so the demo shows the
  real escalation rather than a simulation of one.
- Before `visitorUserId` is known (first paint), operator detection is
  impossible — every `senderId` looks foreign. The rule stays enabled in that
  window, which is safe precisely because escalation is idempotent.
- A failed settings fetch leaves `aiEnabled` false, hiding the button rather
  than offering an escalation the backend may reject.
