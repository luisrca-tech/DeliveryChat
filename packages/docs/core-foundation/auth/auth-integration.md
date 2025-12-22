# Better Auth Multi-Tenant Integration Plan

This plan outlines the steps to integrate Better Auth into the delivery-chat monorepo, implementing multi-tenant authentication with subdomain support using the Organization plugin.

## 1. Architecture & Strategy

### 1.1 Multi-Tenancy Model

- **Strategy**: "Organization per Tenant".
- **Database**:
  - `users`: Global entity (can belong to multiple organizations).
  - `organization`: Represents the Tenant (replaces `tenants` table).
  - `member`: Links User to Organization with a role (`super_admin`, `admin`, `operator`).
- **Subdomain Handling**:
  - **Development**: Use `localhost` or `lvh.me` (e.g., `tenant1.lvh.me:3000`).
  - **Production**: Wildcard cookies (e.g., `.delivery-chat.com`) allow a single session to span the landing page and all tenant subdomains.

### 1.2 Auth Flow

1.  **Sign Up (Web)**: User creates an account + Organization (Tenant).
2.  **Email Verification**: User receives OTP code via email to verify their account.
3.  **Login (Admin/Web)**: User logs in once. Cookie is set for root domain.
4.  **Access (Tenant Subdomain)**:
    - Middleware reads `Host` header to determine tenant.
    - Validates if the logged-in user is a **member** of the target organization.
    - Enforces permissions based on the member's role.

### 1.3 Account Lifecycle Management

The system implements a comprehensive account lifecycle with the following statuses:

#### Status States

- **PENDING_VERIFICATION**: User registered but email not verified (expires after 7 days)
- **ACTIVE**: Email verified, account fully functional
- **EXPIRED**: Pending verification period expired (can be deleted after 90 days)
- **DELETED**: Account permanently removed (status not actively used, records are hard-deleted)

#### Lifecycle Rules

All lifecycle business logic is centralized in `apps/hono-api/src/lib/accountLifecycle.ts`:

**Signup Actions**:

- `ACTIVE` user → `REJECT` (email already in use)
- `PENDING_VERIFICATION` user → `RESEND_OTP` (allow resending verification code)
- `EXPIRED` or `DELETED` user → `ALLOW_NEW` (can recreate account)

**Login Outcomes**:

- `ACTIVE` → `ALLOW` (can login)
- `PENDING_VERIFICATION` → `REJECT_EMAIL_NOT_VERIFIED`
- `EXPIRED` → `REJECT_SIGNUP_EXPIRED`
- `DELETED` → `REJECT_INVALID_CREDENTIALS`

**Organization Slug Reuse**:

- Only `EXPIRED` organizations can have their slug reused
- `ACTIVE` and `PENDING_VERIFICATION` slugs are protected

#### Cleanup Jobs

Two automated cleanup functions maintain account hygiene:

1. **expirePendingAccounts()**: Runs weekly
   - Marks `PENDING_VERIFICATION` accounts as `EXPIRED` after 7 days
   - Applies to both users and organizations

2. **deleteExpiredAccounts()**: Runs bi-weekly
   - Hard deletes `EXPIRED` accounts after 90 days
   - Removes records from database permanently
   - Allows email/slug reuse for new registrations

**Manual Execution**:

```bash
npm run test:cleanup  # E2E test script that validates cleanup logic
```

### 1.4 Email Verification System

Better Auth is configured with the `emailOTP` plugin for email verification:

#### Flow

1. User registers via `/api/register`
2. System sends 6-digit OTP code via Resend email service
3. User enters code on verification page
4. System validates OTP via `/api/verify-email`
5. User and Organization status updated to `ACTIVE`

#### Key Components

- **Email Service**: `apps/hono-api/src/lib/email.ts`
  - Uses Resend API
  - Configurable `EMAIL_FROM` address
  - Templates for OTP and password reset

- **Verification Routes**:
  - `/api/register` - Create account and send OTP
  - `/api/verify-email` - Validate OTP and activate account
  - `/api/resend-otp` - Resend OTP if needed

- **Custom Types**: `apps/hono-api/src/db/schema/customTypes.ts`
  - `emailVerifiedTimestamp` - Converts Better Auth boolean to DB timestamp
  - Handles `true` → current timestamp, `false` → null

#### Configuration

```typescript
// apps/hono-api/src/lib/auth.ts
plugins: [
  emailOTP({
    overrideDefaultEmailVerification: true,
    sendVerificationOnSignUp: false, // Manual control
    async sendVerificationOTP({ email, otp, type }) {
      await sendVerificationOTPEmail({ email, otp });
    },
  }),
];
```

### 1.5 Password Reset

Password reset is handled by Better Auth's `emailAndPassword` plugin with dynamic URL generation:

#### Flow

1. User requests reset via `/forgot-password`
2. System generates token and sends email with reset link
3. Link points to user's organization subdomain: `https://{subdomain}.deliverychat.com/reset-password?token={token}`
4. User enters new password
5. System validates token and updates password

#### Implementation

```typescript
// apps/hono-api/src/lib/auth.ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: false,
  async sendResetPassword({ user, token }) {
    const adminBaseUrl = await getUserAdminUrl(user.id);  // Dynamic URL
    const resetUrl = `${adminBaseUrl}/reset-password?token=${token}`;
    await sendResetPasswordEmail({ email: user.email, url: resetUrl });
  },
}
```

The `getUserAdminUrl()` function:

- Looks up user's organization via `member` table
- Returns subdomain-specific URL
- Falls back to default admin URL if no organization found

### 1.6 Custom Roles and Permissions

Better Auth uses an **access control system** to define custom roles and permissions. This system is configured in `apps/hono-api/src/lib/permissions.ts`.

#### Access Control Architecture

The access control system uses Better Auth's `createAccessControl` function with default organization statements, then defines custom roles with specific permissions:

```typescript
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/organization/access";

const statement = {
  ...defaultStatements,
} as const;

const ac = createAccessControl(statement);
```

#### Role Definitions

Three custom roles are defined with hierarchical permissions:

**1. Super Admin Role** (Full Control)

- **Organization**: `update`, `delete`
- **Member**: `create`, `update`, `delete`
- **Invitation**: `create`, `cancel`
- **Use Case**: Organization creator gets this role automatically (converted from `owner`). Can manage everything.

**2. Admin Role** (Management Control)

- **Organization**: `update` (cannot delete)
- **Member**: `create`, `update`, `delete`
- **Invitation**: `create`, `cancel`
- **Use Case**: Team managers who can manage members and invitations but cannot delete the organization.

**3. Operator Role** (Limited Control)

- **Member**: `create`
- **Invitation**: `create`
- **Use Case**: Support operators who can add new members and send invitations but cannot modify or delete existing members or organization settings.

#### Role Assignment

- **Organization Creator**: Automatically receives `owner` role from Better Auth, which is converted to `super_admin` via hook
- **New Members**: Must be explicitly assigned a role during invitation
- **Invitation**: Roles are assigned when creating invitations:
  ```typescript
  await auth.api.inviteToOrganization({
    organizationId: "org-123",
    email: "user@example.com",
    role: "operator", // or "admin" or "super_admin"
  });
  ```

#### Configuration

The roles are configured in `apps/hono-api/src/lib/auth.ts`:

```typescript
import { ac, super_admin, admin, operator } from "./permissions.js";

export const auth = betterAuth({
  // ... other config
  plugins: [
    organization({
      ac,
      roles: {
        super_admin,
        admin,
        operator,
      },
      organizationHooks: {
        beforeAddMember: async ({ member }) => {
          // Convert Better Auth's "owner" to "super_admin"
          if (member.role === "owner") {
            return {
              data: {
                ...member,
                role: "super_admin" as const,
              },
            };
          }
          return { data: member };
        },
      },
    }),
  ],
});
```

**Important Notes:**

- There is **no `defaultRole` option** - roles are assigned explicitly during invitation or member creation
- The `owner` role is automatically converted to `super_admin` via organization hooks
- The access control instance (`ac`) must be shared between server and client configurations
- Permissions are enforced server-side by Better Auth automatically
- Custom resources can be added to the `statement` object for future feature permissions

## 2. Implementation Steps

### 2.1 Backend (`apps/hono-api`)

- **Dependencies**: Add `better-auth`, `resend`.
- **Database Schema (`src/db/schema`)**:
  - Remove legacy `tenantId` from `users`.
  - Add Better Auth core tables: `user`, `session`, `account`, `verification`.
  - Add Organization plugin tables: `organization`, `member`, `invitation`.
  - Add status enum: `PENDING_VERIFICATION`, `EXPIRED`, `ACTIVE`, `DELETED`.
  - Add lifecycle fields: `status`, `pendingExpiresAt`, `expiredAt` to `user` and `organization`.
  - Add custom types: `emailVerifiedTimestamp`, `timestampString`, `timestampStringNullable`.
  - _Migration_: Map existing `tenants` to `organization` table.
- **Auth Config (`src/lib/auth.ts`)**:
  - Initialize `betterAuth` with `drizzleAdapter`.
  - **Plugins**:
    - Enable `emailOTP()` for email verification with custom sender.
    - Enable `organization()` with access control system and role conversion hooks.
    - Enable `emailAndPassword()` with dynamic password reset URLs.
  - **Cookie Config**: Set `advanced.cookie.domain` to allow cross-subdomain access.
  - **API**: Mount auth routes at `/api/auth/*`.
- **Permissions (`src/lib/permissions.ts`)**:
  - Create access control instance with `createAccessControl`.
  - Define custom roles: `super_admin`, `admin`, `operator`.
  - Export access control instance and roles for use in auth config.
- **Account Lifecycle (`src/lib/accountLifecycle.ts`)**:
  - Centralize all status-based business logic.
  - Define signup actions, login outcomes, and slug reuse rules.
  - Export helper functions for status resolution.
- **Email Service (`src/lib/email.ts`)**:
  - Implement `sendVerificationOTPEmail()` for email verification.
  - Implement `sendResetPasswordEmail()` for password reset.
  - Use Resend API with configurable sender.
- **Cleanup Jobs (`src/jobs/cleanupPendingAccounts.ts`)**:
  - Implement `expirePendingAccounts()` - marks pending as expired after 7 days.
  - Implement `deleteExpiredAccounts()` - deletes expired after 90 days.
  - Add E2E test script in `scripts/test-cleanup.ts`.
- **Custom Routes**:
  - `/api/register` - Custom registration with OTP sending.
  - `/api/verify-email` - Custom email verification with status updates.
  - `/api/resend-otp` - Resend OTP with validation.

### 2.2 Shared UI (`packages/ui`)

- Ensure standard form components are available.

### 2.3 Landing Page (`apps/web`)

- **Register Form**:
  - Inputs: User Name, Email, Password, Company Name (Org Name), Subdomain (Org Slug).
  - Action: Call `/api/register` which creates user, organization, and sends OTP.
  - Redirect: To email verification page with email pre-filled.
- **Email Verification Form**:
  - Input: 6-digit OTP code.
  - Action: Call `/api/verify-email` to validate OTP.
  - On success: Updates user and org status to `ACTIVE`.
  - Redirect: To `http://<slug>.domain.com/admin` (tenant subdomain).
- **Resend OTP**:
  - Button to call `/api/resend-otp`.
  - Only enabled if pending verification period not expired.

### 2.4 Admin Dashboard (`apps/admin`)

- **Dependencies**: Add `better-auth` client.
- **Client Config**: Initialize `createAuthClient` with `organizationClient()` plugin.
- **Login Page**: Standard login with status validation.
- **Forgot Password Page**: Request password reset via Better Auth.
- **Reset Password Page**: Reset password with token from email.
- **Middleware / Guard**:
  - Extract subdomain from URL.
  - Check `useSession`.
  - Verify user is a member of the subdomain's organization.
  - Verify user status is `ACTIVE`.
  - If not member: Show 403 or "Request Access".
  - If not active: Redirect to appropriate flow (verification, expired, etc.).
- **Tenant Context**: Provide `currentOrganization` to the app.

## 3. Environment & Secrets

- **Infisical** (`/hono-api`):
  - `BETTER_AUTH_SECRET`: Generate new secret (min 32 characters).
  - `BETTER_AUTH_URL`: Base API URL (e.g., `http://localhost:8000` for dev, production URL for prod).
  - `DATABASE_URL`: PostgreSQL connection string.
  - `RESEND_API_KEY`: Resend API key for email sending.
  - `EMAIL_FROM`: (Optional) Custom sender email (e.g., `"Delivery Chat <onboarding@deliverychat.online>"`). Falls back to `"Delivery Chat <onboarding@resend.dev>"` if not set.
  - `NODE_ENV`: Environment (`development`, `staging`, `production`).
  - `PORT`: (Optional) Server port.

## 4. Execution Order

1.  **Backend**:
    - Install deps (`better-auth`, `resend`).
    - Update database schema with lifecycle fields and custom types.
    - Configure Better Auth with plugins (emailOTP, organization, emailAndPassword).
    - Implement account lifecycle module.
    - Implement email service with Resend.
    - Create custom auth routes (register, verify-email, resend-otp).
    - Implement cleanup jobs.
2.  **Web**:
    - Implement Sign Up form with org creation.
    - Implement Email Verification form with OTP input.
    - Implement Resend OTP functionality.
    - Redirect to tenant subdomain after verification.
3.  **Admin**:
    - Implement Login with status validation.
    - Implement Forgot Password flow.
    - Implement Reset Password flow with dynamic URLs.
    - Implement Subdomain Guard with status checks.

## 5. Testing

### Manual Testing

1. **Registration Flow**:
   - Register new user with unique email and subdomain.
   - Verify OTP email is received.
   - Enter OTP and verify account activation.
   - Verify redirect to correct tenant subdomain.

2. **Resend OTP Flow**:
   - Try to register with same email (should offer resend).
   - Click resend and verify new OTP is received.
   - Verify old OTP still works until new one is used.

3. **Password Reset Flow**:
   - Request password reset from admin login page.
   - Verify email is received with correct subdomain URL.
   - Click link and reset password.
   - Verify can login with new password.

4. **Expired Account Flow**:
   - Wait 7+ days after registration without verification (or manually update DB).
   - Try to login (should be rejected as expired).
   - Try to register again (should allow new signup).

### Automated Testing

Run cleanup job E2E test:

```bash
cd apps/hono-api
npm run test:cleanup
```

This validates:

- Pending accounts expire after 7 days.
- Expired accounts delete after 90 days.
- Control accounts remain unchanged.
- Deleted users can be recreated with same email.

## 6. Maintenance

### Cleanup Jobs

Currently, cleanup jobs must be run manually:

```bash
cd apps/hono-api
infisical run --path=/hono-api -- tsx src/jobs/cleanupPendingAccounts.ts
```

**Recommended Schedule** (future implementation with Render Cron Jobs or GitHub Actions):

- **Expire**: Weekly (every Sunday at 2 AM UTC)
- **Delete**: Bi-weekly (every other Sunday at 3 AM UTC)

### Monitoring

Monitor the following:

- Email delivery rates (Resend dashboard).
- Account lifecycle transitions (DB queries).
- Cleanup job execution logs.
- Failed verification attempts.
- Password reset success rates.
