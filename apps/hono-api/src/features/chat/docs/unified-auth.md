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

## Relationship to Existing Middleware

- `requireTenantAuth()` and `requireApiKeyAuth()` remain as standalone middleware for routes that haven't migrated to the unified model.
- `requireAuth()` reuses the same validation logic internally but does not call the standalone middleware functions — it implements the logic directly to control the fallback flow.

## Known Risks

### Silent fallthrough on session-level errors

When `trySessionAuth()` encounters a failure (disabled account, tenant mismatch, missing membership), it returns `null` instead of an error response. This allows the fallback to the API key path. The behavior is intentional for the unified flow — a request might carry both a session cookie and API key headers, and a session failure shouldn't block a valid API key auth.

However, this differs from `requireTenantAuth()`'s standalone behavior, which returns explicit 401/403 errors for each failure case. In practice this means: if an operator's account is disabled and they somehow also send API key headers, they'd authenticate as a visitor instead of seeing a "disabled account" error. This is acceptable because:
1. The two auth paths serve fundamentally different clients (admin dashboard vs. widget).
2. A disabled operator would never have valid API key + visitor headers in a real request.
3. Endpoints behind `requireMember()` would still block them.

If this becomes a concern, `trySessionAuth()` could be changed to return a `{ failed: true, reason: string }` discriminant instead of `null`, so `requireAuth()` can short-circuit with the appropriate error when a session was present but invalid.

## File Location

`apps/hono-api/src/lib/middleware/unifiedAuth.ts`
