# Error Contract Pattern

## Summary

Chat service functions throw typed error classes instead of returning `null` for failures. A centralized error mapper converts these into HTTP responses.

## Architecture

```
Service layer (throws typed errors)
  → Route handler (try/catch)
    → mapServiceErrorToResponse() (error → HTTP response)
      → Falls through to generic handler if unmapped
```

## Key files

- `features/chat/chat.service.ts` — error class definitions + service functions
- `features/chat/error-mapper.ts` — centralized `instanceof`-based error → HTTP mapper
- `features/chat/docs/error-contract.md` — full error table and contributor guide

## Benefits

- Route handlers stay thin: validate → call → catch → respond
- No ad-hoc null checks or inline error handling in routes
- All error-to-HTTP mappings are in one place and independently testable
- New errors follow a mechanical checklist (define class, add mapping, add test)
