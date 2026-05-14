# useVisitorUserId

## Responsibility

Tracks the authenticated visitor's user id as returned by the API. Once captured, the id is cached for the lifetime of the component so it can be used to identify which messages belong to the visitor (for edit/delete eligibility).

## Owned state

- `visitorUserId: string | null` — null until the first `listConversations` or `createConversation` response arrives.

## Exposed API

```ts
function useVisitorUserId(): {
  visitorUserId: string | null;
  captureVisitorId(id: string | null): void;
}
```

- `captureVisitorId` — idempotent: ignores null and ignores subsequent non-null calls once a value has been set (first-write-wins).

## Test strategy

- Verifies initial null state.
- Verifies first non-null capture is retained.
- Verifies subsequent captures are ignored (first-write-wins invariant).
- Verifies null captures are ignored.
