# Better Auth + Multi-Tenant (Subdomain) Study Guide

This document is a study guide for the Better Auth integration and the multi-tenant setup based on **Organization per Tenant** (subdomain == `organization.slug`). It focuses on what was implemented, why those decisions were made, and how to extend it safely.

## Goals / Acceptance Criteria Mapping

- **Admins can log in to their tenant dashboard**
  - Admin UI authenticates via Better Auth and then routes to tenant-scoped dashboard.
  - API resolves tenant by **Host subdomain** and scopes data to the **active organization**.

- **Email verification required for account activation**
  - Users must verify email via OTP before accessing their organization.
  - Unverified accounts expire after 7 days.

- **Roles and permissions**
  - Roles are defined (super_admin/admin/operator).
  - API enforces **membership** and a first-pass **role gate** (rank-based) on routes.

- **Tenant data integrity**
  - API queries are scoped to the **organization derived from Host**, not "all orgs a user belongs to".

- **Account lifecycle management**
  - Pending accounts expire automatically.
  - Expired accounts are deleted after retention period.
  - Deleted users can re-register with the same email.

- **Password reset with tenant context**
  - Reset links point to user's organization subdomain.
  - Works seamlessly across multi-tenant architecture.

- **Compatibility with chat features / widget / realtime**
  - Auth is cookie/session based and independent from chat transport; tenant scoping is derived from Host.

## Mental Model

### Tenant resolution

- **Tenant** is derived from the incoming request `Host` header.
  - Dev: `tenant.localhost`
  - Prod: `tenant.deliverychat.com`
- The resolved subdomain is mapped to an organization:
  - `subdomain` → `organization.slug` → `organization.id`

### Account Lifecycle States

Every user and organization has a `status` field with one of four values:

- **PENDING_VERIFICATION**: Initial state after registration, waiting for email verification (7-day expiration)
- **ACTIVE**: Email verified, account fully operational
- **EXPIRED**: Verification period expired or account deactivated (90-day retention before deletion)
- **DELETED**: Conceptual state (records are actually hard-deleted from DB)

### Authentication + Authorization flow (API)

1. **Require session**: `auth.api.getSession({ headers })`
2. **Validate user status**: User must be `ACTIVE` (not pending, expired, or deleted)
3. **Resolve tenant org**: `Host` → `slug` → `organization`
4. **Validate org status**: Organization must be `ACTIVE`
5. **Require membership**: `(userId, organizationId)` must exist in `member`
6. **Enforce role** (first pass): operator < admin < super_admin

### Email Verification Flow

1. User registers via `/api/register`
2. User and org created with `PENDING_VERIFICATION` status
3. OTP sent via email using Resend
4. User submits OTP via `/api/verify-email`
5. Better Auth validates OTP
6. Custom logic updates user and org status to `ACTIVE`
7. User redirected to their org's subdomain admin dashboard

## Key Decisions (and why)

### 1) Host-subdomain is the source of truth for tenant scoping

Using Host keeps the API stateless and prevents clients from "switching tenants" by passing an `organizationId`.

### 2) Active-org-only scoping (not all memberships)

Even if a user belongs to multiple organizations, **the subdomain determines which org's data is accessible**.

### 3) Centralized account lifecycle logic

All status-based business rules are in `apps/hono-api/src/lib/accountLifecycle.ts`:

- Prevents status checks scattered across codebase
- Single source of truth for signup/login/slug-reuse rules
- Easy to test and maintain

**Example**: If you need to check "can this user sign up?", call `resolveSignupAction(user, pendingExpiresAt)` instead of writing `if (user.status === ...)`.

### 4) Email verification required but flexible

- Verification is required for account activation
- Unverified accounts can resend OTP (within 7-day window)
- Expired accounts can re-register (email becomes available)
- Better Auth handles OTP generation/validation, we handle status transitions

### 5) Custom Drizzle types for Better Auth compatibility

Better Auth uses `boolean` for `emailVerified`, but we store timestamps in PostgreSQL:

- `emailVerifiedTimestamp` custom type converts `true` → current timestamp, `false` → null
- Allows querying "when was email verified" while staying compatible with Better Auth

### 6) Password reset with dynamic URLs

Reset emails contain subdomain-specific URLs:

- System looks up user's organization
- Generates URL like `https://{subdomain}.deliverychat.com/reset-password?token={token}`
- User stays in their tenant context during password reset

### 7) SSR gotchas in the Admin app

TanStack Start runs some route logic during SSR. Session cookies may not be available server-side, which can cause redirect loops ("blinking"). The fix is to avoid server-side redirects that depend on browser cookies.

### 8) Cookie/session handling in dev with subdomains

Subdomain dev (`tenant.localhost`) can behave differently than plain `localhost` with cookies and proxies.
The stable approach is to keep auth requests and cookies aligned with the hostname being used.

### 9) Role conversion from owner to super_admin

Better Auth automatically assigns `owner` role to organization creators, but we use `super_admin` internally:

- Organization hooks convert `owner` → `super_admin` automatically
- Keeps naming consistent with our role hierarchy
- No manual role assignment needed for first user

## Where the code lives

### API (hono-api)

- **Better Auth wiring**:
  - `apps/hono-api/src/lib/auth.ts` - Main config with plugins (emailOTP, organization, emailAndPassword)
  - `apps/hono-api/src/lib/auth/*` - Small helpers: baseUrl/origins/advanced

- **Account lifecycle**:
  - `apps/hono-api/src/lib/accountLifecycle.ts` - **Centralized status logic** (signup actions, login outcomes, slug reuse)

- **Email service**:
  - `apps/hono-api/src/lib/email.ts` - Resend integration for OTP and password reset emails

- **Custom auth routes**:
  - `apps/hono-api/src/routes/register.ts` - Custom registration with OTP sending
  - `apps/hono-api/src/routes/verify-email.ts` - OTP validation and status activation
  - `apps/hono-api/src/routes/resend-otp.ts` - Resend OTP with validation

- **Tenant resolution**:
  - `apps/hono-api/src/lib/tenant.ts`

- **Auth middleware** (session + tenant + membership + role gate):
  - `apps/hono-api/src/lib/middleware/auth.ts`

- **Shared error helper**:
  - `apps/hono-api/src/lib/http.ts`

- **Database schema**:
  - `apps/hono-api/src/db/schema/users.ts` - User table with status and lifecycle fields
  - `apps/hono-api/src/db/schema/organization.ts` - Organization table with status
  - `apps/hono-api/src/db/schema/customTypes.ts` - **Custom Drizzle types** (emailVerifiedTimestamp, timestampString)
  - `apps/hono-api/src/db/schema/enums/statusEnum.ts` - Status enum definition

- **Cleanup jobs**:
  - `apps/hono-api/src/jobs/cleanupPendingAccounts.ts` - Expire and delete functions
  - `apps/hono-api/scripts/test-cleanup.ts` - E2E test for cleanup jobs

- **Permissions**:
  - `apps/hono-api/src/lib/permissions.ts` - Access control with super_admin/admin/operator roles

- **Tenant-scoped routes** (examples):
  - `apps/hono-api/src/routes/applications.ts`
  - `apps/hono-api/src/routes/users.ts`

### Admin (apps/admin)

- **Subdomain parsing** (client-side):
  - `apps/admin/src/lib/subdomain.ts`

- **Session guard / org selection**:
  - `apps/admin/src/routes/_system.tsx`

- **Auth UI**:
  - `apps/admin/src/routes/_public/login.tsx` - Login with status validation
  - `apps/admin/src/routes/_public/forgot-password.tsx` - Password reset request
  - `apps/admin/src/routes/_public/reset-password.tsx` - Password reset confirmation

- **Auth hooks**:
  - `apps/admin/src/features/forgot-password/hooks/useForgotPassword.ts`
  - `apps/admin/src/features/reset-password/hooks/useResetPassword.ts`

### Web (apps/web)

- **Signup + organization creation**:
  - `apps/web/src/components/RegisterForm.tsx` - Calls `/api/register`

- **Email verification**:
  - `apps/web/src/components/VerifyEmailForm.tsx` - OTP input and validation

## How to extend correctly

### Account lifecycle rules

To add new status-based behavior:

1. **Update the status enum** (if needed): `apps/hono-api/src/db/schema/enums/statusEnum.ts`
2. **Update the maps** in `accountLifecycle.ts`:
   - `SIGNUP_ACTION_MAP` - What to do when user tries to sign up
   - `LOGIN_OUTCOME_MAP` - What to do when user tries to log in
   - `SLUG_REUSE_MAP` - Whether org slug can be reused
   - `ERROR_MESSAGE_MAP` - Error messages for each outcome
3. **Create migration** for database schema changes
4. **Update E2E tests** in `scripts/test-cleanup.ts`

**Example**: Adding a "SUSPENDED" status for manually suspended accounts:

```typescript
// Add to statusEnum
export const statusEnum = pgEnum("status", [
  "PENDING_VERIFICATION",
  "EXPIRED",
  "ACTIVE",
  "SUSPENDED", // New
  "DELETED",
]);

// Update maps
const LOGIN_OUTCOME_MAP: Record<UserStatus, LoginOutcome> = {
  ACTIVE: "ALLOW",
  PENDING_VERIFICATION: "REJECT_EMAIL_NOT_VERIFIED",
  EXPIRED: "REJECT_SIGNUP_EXPIRED",
  SUSPENDED: "REJECT_ACCOUNT_SUSPENDED", // New
  DELETED: "REJECT_INVALID_CREDENTIALS",
};
```

### Email templates

To customize email templates:

- Edit `apps/hono-api/src/lib/email.ts`
- Update `sendVerificationOTPEmail()` for OTP emails
- Update `sendResetPasswordEmail()` for password reset emails

### Cleanup job schedule

To adjust cleanup timing:

- Edit constants in `apps/hono-api/src/jobs/cleanupPendingAccounts.ts`
- Update `sevenDaysAgo` constant for pending expiration
- Update `ninetyDaysAgo` constant for deletion retention

### Stronger permissions (recommended next step)

Right now, route enforcement is a minimal **role rank gate**.
To make it fully aligned with Better Auth access control statements:

- Map `member.role` → policy role (`super_admin/admin/operator`) and enforce actions per route (resource + action).
- Keep enforcement in API middleware, not just UI.

### Additional tenant-scoped routes

Copy the pattern used in `applications.ts`:

- `requireTenantAuth()`
- `const { organization } = getTenantAuth(c)`
- Scope DB queries by `organization.id`
- Validate organization status is `ACTIVE`

## Debugging checklist

- **Registration successful but no email received**
  - Check Resend API key is valid
  - Check `EMAIL_FROM` is configured (or using resend.dev default)
  - Check Resend dashboard for delivery logs
  - Verify email service isn't throwing errors (check server logs)

- **OTP validation fails**
  - Verify OTP hasn't expired (5-minute default from Better Auth)
  - Check user status is `PENDING_VERIFICATION`
  - Verify `Origin` header is being passed in request
  - Check Better Auth verification table for OTP record

- **Login works but dashboard redirects back to login**
  - Check if session cookie is being set for the hostname being used
  - Confirm the API receives the right `Host` and the tenant org is found
  - Verify user status is `ACTIVE` (not pending or expired)
  - Check organization status is `ACTIVE`

- **Access denied on a tenant subdomain**
  - Verify `organization.slug` matches the subdomain
  - Verify the user has a `member` row for that `organizationId`
  - Check both user and organization status are `ACTIVE`

- **Unexpected cross-tenant data**
  - Ensure the route is filtering by `organization.id` (not by all memberships)

- **Password reset email not received**
  - Check Resend configuration
  - Verify `getUserAdminUrl()` is returning correct subdomain URL
  - Check user has an organization membership

- **Cannot recreate account after deletion**
  - Verify cleanup job actually deleted the records (not just marked as deleted)
  - Check if organization slug still exists in database
  - Ensure `canReuseOrganizationSlug()` returns true for the org status

- **Accounts not expiring automatically**
  - Cleanup jobs must be run manually or scheduled
  - Check `pendingExpiresAt` is set correctly during registration
  - Verify `shouldExpireUser()` logic in accountLifecycle.ts

## Common patterns

### Check if user can perform action based on status

```typescript
import { resolveLoginOutcome } from "@/lib/accountLifecycle";

const outcome = resolveLoginOutcome(user);
if (outcome !== "ALLOW") {
  const message = getStatusSpecificErrorMessage(outcome);
  return error(message);
}
```

### Determine signup flow for existing email

```typescript
import { resolveSignupAction } from "@/lib/accountLifecycle";

const action = resolveSignupAction(
  existingUser,
  existingUser?.pendingExpiresAt,
);
if (action === "REJECT") {
  return error("Email already in use");
} else if (action === "RESEND_OTP") {
  // Resend verification email
} else {
  // Allow new signup (ALLOW_NEW)
}
```

### Check if organization slug can be reused

```typescript
import { canReuseOrganizationSlug } from "@/lib/accountLifecycle";

if (!canReuseOrganizationSlug(existingOrg)) {
  return error("Subdomain already in use");
}
```

### Validate account is active before operation

```typescript
if (user.status !== "ACTIVE" || org.status !== "ACTIVE") {
  return error("Account not active");
}
```
