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

## File Location

`apps/hono-api/src/lib/middleware/unifiedAuth.ts`
