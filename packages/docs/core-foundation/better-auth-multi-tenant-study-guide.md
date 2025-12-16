# Better Auth + Multi-Tenant (Subdomain) Study Guide

This document is a study guide for the Better Auth integration and the multi-tenant setup based on **Organization per Tenant** (subdomain == `organization.slug`). It focuses on what was implemented, why those decisions were made, and how to extend it safely.

## Goals / Acceptance Criteria Mapping

- **Admins can log in to their tenant dashboard**
  - Admin UI authenticates via Better Auth and then routes to tenant-scoped dashboard.
  - API resolves tenant by **Host subdomain** and scopes data to the **active organization**.

- **Roles and permissions**
  - Roles are defined (owner/admin/operator).
  - API enforces **membership** and a first-pass **role gate** (rank-based) on routes.

- **Tenant data integrity**
  - API queries are scoped to the **organization derived from Host**, not “all orgs a user belongs to”.

- **Compatibility with chat features / widget / realtime**
  - Auth is cookie/session based and independent from chat transport; tenant scoping is derived from Host.

## Mental Model

### Tenant resolution

- **Tenant** is derived from the incoming request `Host` header.
  - Dev: `tenant.localhost`
  - Prod: `tenant.deliverychat.com`
- The resolved subdomain is mapped to an organization:
  - `subdomain` → `organization.slug` → `organization.id`

### Authentication + Authorization flow (API)

1. **Require session**: `auth.api.getSession({ headers })`
2. **Resolve tenant org**: `Host` → `slug` → `organization`
3. **Require membership**: `(userId, organizationId)` must exist in `member`
4. **Enforce role** (first pass): operator < admin < owner

## Key Decisions (and why)

### 1) Host-subdomain is the source of truth for tenant scoping

Using Host keeps the API stateless and prevents clients from “switching tenants” by passing an `organizationId`.

### 2) Active-org-only scoping (not all memberships)

Even if a user belongs to multiple organizations, **the subdomain determines which org’s data is accessible**.

### 3) SSR gotchas in the Admin app

TanStack Start runs some route logic during SSR. Session cookies may not be available server-side, which can cause redirect loops (“blinking”). The fix is to avoid server-side redirects that depend on browser cookies.

### 4) Cookie/session handling in dev with subdomains

Subdomain dev (`tenant.localhost`) can behave differently than plain `localhost` with cookies and proxies.
The stable approach is to keep auth requests and cookies aligned with the hostname being used.

## Where the code lives

### API (hono-api)

- Better Auth wiring:
  - `apps/hono-api/src/lib/auth.ts`
  - `apps/hono-api/src/lib/auth/*` (small helpers: baseUrl/origins/advanced)

- Tenant resolution:
  - `apps/hono-api/src/lib/tenant.ts`

- Auth middleware (session + tenant + membership + role gate):
  - `apps/hono-api/src/lib/middleware/auth.ts`

- Shared error helper:
  - `apps/hono-api/src/lib/http.ts`

- Tenant-scoped routes (examples):
  - `apps/hono-api/src/routes/applications.ts`
  - `apps/hono-api/src/routes/users.ts`

### Admin (apps/admin)

- Subdomain parsing (client-side):
  - `apps/admin/src/lib/subdomain.ts`

- Session guard / org selection:
  - `apps/admin/src/routes/_system.tsx`

- Login UI:
  - `apps/admin/src/routes/_public/login.tsx`

### Web (apps/web)

- Signup + organization creation + redirect to tenant admin:
  - `apps/web/src/components/RegisterForm.tsx`

## How to extend correctly

### Stronger permissions (recommended next step)

Right now, route enforcement is a minimal **role rank gate**.
To make it fully aligned with Better Auth access control statements:

- Map `member.role` → policy role (`owner/admin/operator`) and enforce actions per route (resource + action).
- Keep enforcement in API middleware, not just UI.

### Additional tenant-scoped routes

Copy the pattern used in `applications.ts`:

- `requireTenantAuth()`
- `const { organization } = getTenantAuth(c)`
- Scope DB queries by `organization.id`

## Debugging checklist

- **Login works but dashboard redirects back to login**
  - Check if session cookie is being set for the hostname being used.
  - Confirm the API receives the right `Host` and the tenant org is found.

- **Access denied on a tenant subdomain**
  - Verify `organization.slug` matches the subdomain.
  - Verify the user has a `member` row for that `organizationId`.

- **Unexpected cross-tenant data**
  - Ensure the route is filtering by `organization.id` (not by all memberships).
