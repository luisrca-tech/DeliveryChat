# Remove Subject Requirement for Resolving

## Business Rule

Operators can mark a conversation as solved regardless of whether a subject has been set. The subject field remains visible and editable but is fully optional — it never blocks the resolve action.

## What Changed

The `ChatHeader` component previously gated the "Mark as Solved" action behind a subject check: if `conversation.subject` was null, it showed a warning toast and forced the operator into subject edit mode. This gate was removed so clicking "Mark as Solved" opens the resolve confirmation dialog directly.

## Technical Details

- **No backend changes**: the resolve endpoint (`POST /conversations/:id/resolve`) never validated subject presence.
- **Subject field unchanged**: still visible in the header, editable via pencil icon when assigned, with the same save/cancel flow.
- The only code removed was the early-return guard in the dropdown menu's `onSelect` handler for the resolve item.

## Test Coverage

- `ChatHeader.test.tsx` covers:
  - Resolve dialog opens with a subject present
  - Resolve dialog opens with no subject (null)
  - No warning toast appears when resolving without subject
  - Subject text displays correctly
  - Subject field remains editable via pencil button
