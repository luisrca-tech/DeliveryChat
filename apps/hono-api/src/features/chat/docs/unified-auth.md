# Unified Auth Middleware

## Overview

The `requireAuth()` middleware provides a single entry point for authenticating both member (session-based) and visitor (API key-based) requests. It produces a **discriminated union** context, allowing downstream handlers and guards to branch on `auth.type`.

## Auth Context Types

```typescript
type MemberAuthContext = {
  type: "member";
  session: SessionResult;
  user: { id: string; name: string };
  organization: ResolvedOrganization;
  membership: { id: string; role: string; userId: string; organizationId: string };
};

type VisitorAuthContext = {
  type: "visitor";
  visitorId: string;
  visitorUserId: string;
  application: ResolvedApplication;
  apiKey: { id: string; environment: "live" | "test" };
};

type UnifiedAuthContext = MemberAuthContext | VisitorAuthContext;
```

## Fallback Order

1. **Session auth** — tried first via Better Auth `getSession()`. If a valid session exists with an active user, active organization membership, and resolved tenant, produces `MemberAuthContext`.
2. **API key auth** — tried only if session auth fails. Validates `Authorization: Bearer dk_(live|test)_...` + `X-App-Id` + `X-Visitor-Id` headers. Resolves or creates the visitor user record. Produces `VisitorAuthContext`.
3. **401** — if neither path succeeds.

## Guards

### `requireMember()`

Runs after `requireAuth()`. Returns 403 if `auth.type !== "member"`. Use on endpoints that only members (operators, admins, super_admins) should access.

## Migration Status

### Phase 2C: Member-Only Endpoints

All five member-only conversation endpoints now use `requireAuth()` + `requireMember()`:

| Endpoint | Previous Middleware | Current Middleware |
|---|---|---|
| `POST /:id/accept` | `requireTenantAuth()` | `requireAuth()` → `requireMember()` |
| `POST /:id/leave` | `requireTenantAuth()` | `requireAuth()` → `requireMember()` |
| `POST /:id/resolve` | `requireTenantAuth()` | `requireAuth()` → `requireMember()` |
| `DELETE /:id` | `requireTenantAuth()` → `requireRole("admin")` | `requireAuth()` → `requireMember()` → inline role check |
| `PATCH /:id/subject` | `requireTenantAuth()` | `requireAuth()` → `requireMember()` |

Visitors now receive **403 Forbidden** instead of **401 Unauthorized** on these endpoints. This is semantically correct: the visitor is authenticated but not authorized for member-only operations.

The `requireRole("admin")` middleware on the delete endpoint was replaced with an inline role check because `requireRole` depends on `getTenantAuth()` which reads from the old `auth` context key, not the unified `unifiedAuth` key.

### publicApi.ts Removal

`publicApi.ts` and its route registration (`.route("/api", publicApiRoute)`) have been deleted. All conversation functionality is now consolidated in `conversations.ts` under the unified auth model. The `public-rest-api.md` doc is archived — see below.

### Phase 6: Service Layer Extraction

All inline database queries have been extracted from `conversations.ts` into `chat.service.ts`. Route handlers are now thin wrappers that validate input, call the appropriate service function, and return the response. Two new service functions were added:

| Service Function | Replaces | Notes |
|---|---|---|
| `listConversationsForMember()` | Inline `db.select()` in GET `/` member path | Handles filtering, counting, and unread count aggregation |
| `getMessageHistoryForMember()` | Inline `db.select()` in GET `/:id/messages` member path | Joins sender name/role, validates org ownership (throws `ConversationNotFoundError`) |

`conversations.ts` no longer imports `db`, `drizzle-orm`, or any schema modules.

Orphaned files deleted:
- `participant-guard.ts` — was only used by the deleted `publicApi.ts`
- `__tests__/participant-guard.test.ts` — test for the deleted file

## Relationship to Existing Middleware

- `requireTenantAuth()` and `requireApiKeyAuth()` remain as standalone middleware for non-conversation routes that haven't migrated to the unified model.
- `requireAuth()` reuses the same validation logic internally but does not call the standalone middleware functions — it implements the logic directly to control the fallback flow.

## Known Risks

### Silent fallthrough on session-level errors

When `trySessionAuth()` encounters a failure (disabled account, tenant mismatch, missing membership), it returns `null` instead of an error response. This allows the fallback to the API key path. The behavior is intentional for the unified flow — a request might carry both a session cookie and API key headers, and a session failure shouldn't block a valid API key auth.

However, this differs from `requireTenantAuth()`'s standalone behavior, which returns explicit 401/403 errors for each failure case. In practice this means: if an operator's account is disabled and they somehow also send API key headers, they'd authenticate as a visitor instead of seeing a "disabled account" error. This is acceptable because:
1. The two auth paths serve fundamentally different clients (admin dashboard vs. widget).
2. A disabled operator would never have valid API key + visitor headers in a real request.
3. Endpoints behind `requireMember()` would still block them.

If this becomes a concern, `trySessionAuth()` could be changed to return a `{ failed: true, reason: string }` discriminant instead of `null`, so `requireAuth()` can short-circuit with the appropriate error when a session was present but invalid.

### requireRole incompatibility with unified auth context

`requireRole()` in `auth.ts` reads membership data via `getTenantAuth(c)`, which looks up `c.get("auth")`. The unified auth middleware sets `c.get("unifiedAuth")` instead. This means `requireRole()` cannot be used after `requireAuth()` — it will get `null` and crash.

The delete endpoint works around this with an inline role check. If more endpoints need role-based guards under unified auth, a `requireMemberRole(minRole)` middleware should be created in `unifiedAuth.ts` that reads from `getUnifiedAuth(c)`.

### Widget clients still hit widget.ts, not conversations.ts

The widget frontend uses `widget.ts` endpoints (e.g., `POST /widget/ws-token`, `POST /widget/conversations`) which have their own auth via `requireWidgetAuth()`. These are not yet migrated to the unified auth model. Widget clients are unaffected by the `publicApi.ts` deletion because they never used the `/api/*` routes — they use `/widget/*`.

### APIType shape change (verified in Phase 5)

Removing `.route("/api", publicApiRoute)` from `api.ts` changed the exported `APIType`. The admin frontend RPC client was updated in Phase 5 to target `/api/v1` as its base URL. TypeScript compilation passes — no RPC calls were referencing the old `/api/conversations/*` or `/api/ws-token` paths.

## File Location

`apps/hono-api/src/lib/middleware/unifiedAuth.ts`
