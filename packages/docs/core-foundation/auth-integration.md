# Better Auth Multi-Tenant Integration Plan

This plan outlines the steps to integrate Better Auth into the delivery-chat monorepo, implementing multi-tenant authentication with subdomain support using the Organization plugin.

## 1. Architecture & Strategy

### 1.1 Multi-Tenancy Model

- **Strategy**: "Organization per Tenant".
- **Database**:
  - `users`: Global entity (can belong to multiple organizations).
  - `organization`: Represents the Tenant (replaces `tenants` table).
  - `member`: Links User to Organization with a role (`owner`, `admin`, `member`).
- **Subdomain Handling**:
  - **Development**: Use `localhost` or `lvh.me` (e.g., `tenant1.lvh.me:3000`).
  - **Production**: Wildcard cookies (e.g., `.delivery-chat.com`) allow a single session to span the landing page and all tenant subdomains.

### 1.2 Auth Flow

1.  **Sign Up (Web)**: User creates an account + Organization (Tenant).
2.  **Login (Admin/Web)**: User logs in once. Cookie is set for root domain.
3.  **Access (Tenant Subdomain)**:
    - Middleware reads `Host` header to determine tenant.
    - Validates if the logged-in user is a **member** of the target organization.
    - Enforces permissions based on the member's role.

### 1.3 Custom Roles and Permissions

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

**1. Owner Role** (Full Control)

- **Organization**: `update`, `delete`
- **Member**: `create`, `update`, `delete`
- **Invitation**: `create`, `cancel`
- **Use Case**: Organization creator gets this role automatically. Can manage everything.

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

- **Organization Creator**: Automatically receives `owner` role (built-in Better Auth behavior)
- **New Members**: Default to `member` role unless explicitly assigned during invitation
- **Invitation**: Roles are assigned when creating invitations:
  ```typescript
  await auth.api.inviteToOrganization({
    organizationId: "org-123",
    email: "user@example.com",
    role: "operator", // or "admin"
  });
  ```

#### Configuration

The roles are configured in `apps/hono-api/src/lib/auth.ts`:

```typescript
import { ac, owner, admin, operator } from "./permissions.js";

export const auth = betterAuth({
  // ... other config
  plugins: [
    organization({
      ac,
      roles: {
        owner,
        admin,
        operator,
      },
    }),
  ],
});
```

**Important Notes:**

- There is **no `defaultRole` option** - roles are assigned explicitly during invitation or member creation
- The access control instance (`ac`) must be shared between server and client configurations
- Permissions are enforced server-side by Better Auth automatically
- Custom resources can be added to the `statement` object for future feature permissions

## 2. Implementation Steps

### 2.1 Backend (`apps/hono-api`)

- **Dependencies**: Add `better-auth`.
- **Database Schema (`src/db/schema`)**:
  - Remove legacy `tenantId` from `users`.
  - Add Better Auth core tables: `user`, `session`, `account`, `verification`.
  - Add Organization plugin tables: `organization`, `member`, `invitation`.
  - _Migration_: Map existing `tenants` to `organization` table.
- **Auth Config (`src/lib/auth.ts`)**:
  - Initialize `betterAuth` with `drizzleAdapter`.
  - **Plugins**: Enable `organization()` with access control system.
  - **Cookie Config**: Set `advanced.cookie.domain` to allow cross-subdomain access.
  - **API**: Mount auth routes at `/api/auth/*`.
- **Permissions (`src/lib/permissions.ts`)**:
  - Create access control instance with `createAccessControl`.
  - Define custom roles: `owner`, `admin`, `operator`.
  - Export access control instance and roles for use in auth config.

### 2.2 Shared UI (`packages/ui`)

- Ensure standard form components are available.

### 2.3 Landing Page (`apps/web`)

- **Register Form**:
  - Inputs: User Name, Email, Password, Company Name (Org Name), Subdomain (Org Slug).
  - Action: Chain `signUp` -> `createOrganization`.
  - Redirect: To `http://<slug>.domain.com/admin`.

### 2.4 Admin Dashboard (`apps/admin`)

- **Dependencies**: Add `better-auth` client.
- **Client Config**: Initialize `createAuthClient` with `organizationClient()` plugin.
- **Login Page**: Standard login.
- **Middleware / Guard**:
  - Extract subdomain from URL.
  - Check `useSession`.
  - Verify user is a member of the subdomain's organization.
  - If not member: Show 403 or "Request Access".
- **Tenant Context**: Provide `currentOrganization` to the app.

## 3. Environment & Secrets

- **Infisical**:
  - `BETTER_AUTH_SECRET`: Generate new secret.
  - `BETTER_AUTH_URL`: Base API URL (e.g., `http://api.delivery-chat.com` or `http://localhost:3000`).
  - `DATABASE_URL`: Existing.

## 4. Execution Order

1.  **Backend**: Install deps, Update Schema, Configure Auth.
2.  **Web**: Implement Sign Up with Org creation.
3.  **Admin**: Implement Login & Subdomain Guard.
