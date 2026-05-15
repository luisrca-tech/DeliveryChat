# Public Surface Minimization

## Business Rules

- `window.DeliveryChat` exposes exactly three members: `init`, `destroy`, and `queue`.
- No tokens, API keys, visitor identifiers, or internal state are accessible from host-page JavaScript.
- The `queue` array is a command-queue implementation detail used only during pre-load initialization.

## Technical Decisions

- **Type-level enforcement**: `DeliveryChatAPI` type constrains the global assignment. Adding a new property requires updating the type, which surfaces in the compile-time check and test suite.
- **Test coverage**: A compile-time type assertion test verifies the exact key set of `DeliveryChatAPI` matches `{init, destroy, queue}`. Any addition or removal causes a type error.
