# Error Contract

## Overview

All service functions in `chat.service.ts` throw typed errors instead of returning `null` for failure paths. Route handlers use a centralized error mapper (`error-mapper.ts`) to convert these errors into HTTP responses.

## Pattern

```
Route handler → try/catch → mapServiceErrorToResponse(c, error) → HTTP response
```

Handlers follow a strict thin-handler pattern:

1. Validate input (via Zod middleware)
2. Call service function
3. Catch errors via `mapServiceErrorToResponse`
4. Return response

No business logic or ad-hoc error handling lives in route handlers.

## Error Classes

| Error Class                        | HTTP Status       | Error Code                | Thrown When                                          |
| ---------------------------------- | ----------------- | ------------------------- | ---------------------------------------------------- |
| `MessageNotFoundError`             | 404               | `not_found`               | Message ID doesn't exist                             |
| `NotMessageSenderError`            | 403               | `forbidden`               | User tries to modify another user's message          |
| `MessageEditWindowExpiredError`    | 422               | `edit_window_expired`     | Edit attempted after time window                     |
| `ConversationNotFoundError`        | 404               | `not_found`               | Conversation ID doesn't exist or wrong org           |
| `ConversationNotActiveError`       | 422               | `conversation_not_active` | Action requires active conversation                  |
| `ParticipantAlreadyExistsError`    | 409               | `conflict`                | Duplicate participant add                            |
| `NotAssignedToConversationError`   | 403               | `forbidden`               | User not assigned to conversation                    |
| `ConversationAlreadyAssignedError` | 409               | `conflict`                | Accept race condition (already taken)                |
| `ConversationNotAssignedError`     | 404               | `not_found`               | Leave/resolve when not assigned                      |
| `ConversationUpdateFailedError`    | 404               | `not_found`               | Update returned no rows                              |
| `SystemMessageFailedError`         | _(falls through)_ | —                         | System message insert failed; handled by generic 500 |

## Adding New Errors

1. Define a new error class in `chat.service.ts` extending `Error`
2. Set `this.name` to the class name in the constructor
3. Add a mapping in `error-mapper.ts` using `instanceof` check
4. Add a test case in `__tests__/error-mapper.test.ts`
5. Throw the error in the service function instead of returning `null`
