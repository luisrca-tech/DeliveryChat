# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DeliveryChat is a **multi-tenant SaaS chat platform** built as a Turborepo monorepo. Companies (tenants) embed a customizable chat widget on their websites; end users chat with support teams through it. Each tenant is identified by a unique subdomain and has isolated data.

## Monorepo Structure

| App/Package | Framework | Port | Purpose |
|---|---|---|---|
| `apps/admin` | TanStack Router + React 19 | 3000 | Admin dashboard (visitors, settings, billing, API keys) |
| `apps/widget` | React Router v7 + React 19 | 3001 | Embeddable chat widget (iframe + IIFE build) |
| `apps/web` | Astro v5 | 3002 | Landing page with registration flow |
| `apps/hono-api` | Hono v4 + Drizzle ORM | 8000 | Backend API (all business logic, auth, billing) |
| `apps/docs` | Static | - | Documentation site |
| `packages/types` | TypeScript | - | Shared types, Zod schemas, validation |
| `packages/ui` | React | - | Shared UI components (shadcn-based) |
| `packages/emails` | React Email | - | Transactional email templates |
| `packages/infisical` | TypeScript | - | Infisical SDK wrapper |
| `packages/docs` | Markdown | - | Feature documentation |

## Common Commands

```bash
# Install dependencies
bun install

# Development (all apps, secrets auto-injected via Infisical)
bun run dev

# Single app
bun run dev --filter=hono-api
bun run dev --filter=admin
bun run dev --filter=widget
bun run dev --filter=web

# Build, lint, type-check
bun run build
bun run lint
bun run check-types

# Database (run from repo root — scripts use Infisical)
bun run db:generate    # Generate Drizzle migrations
bun run db:push        # Push schema to database
bun run db:migrate     # Run migrations
bun run db:studio      # Drizzle Studio GUI
bun run db:seed        # Seed data (uses @faker-js)
bun run db:drop        # Drop all tables

# Testing (Vitest)
bun run test                              # Run all tests
bun run test --filter=hono-api            # Tests for API only
bunx vitest run path/to/file.test.ts      # Single test file

# Widget embed build
cd apps/widget && bun run build:embed     # Vite IIFE build

# Stripe webhooks
bun run stripe:listen

# Env validation bypass (CI/lint only — never in production)
SKIP_ENV_VALIDATION=true bun run build
```

## Architecture Key Points

### Backend (hono-api)

- **Auth:** Better Auth v1.4.7 with plugins: `emailAndPassword`, `bearer`, `emailOTP`, `organization`. Roles: `super_admin`, `admin`, `operator`. Config at `apps/hono-api/src/lib/auth.ts`.
- **Database:** PostgreSQL + Drizzle ORM. Schema files in `apps/hono-api/src/db/schema/`. Enums in `schema/enums/`. Custom timestamp types in `customTypes.ts` serialize timestamps as strings.
- **Tenant plans:** `FREE`, `BASIC`, `PREMIUM`, `ENTERPRISE` with plan-based feature limits defined in `src/lib/planLimits.ts`. Per-tenant overrides stored in `tenantRateLimits` table.
- **Routes:** Composed in `src/lib/api.ts`, which exports `APIType` — the type used by the admin frontend's RPC client. Route files in `src/routes/`.
- **Error responses:** Always use `jsonError(c, status, error, message?)` from `lib/http.ts` — never raw `c.json({ error })`.
- **Billing:** Stripe integration — webhooks handled in `src/routes/webhooks.ts`, client in `src/lib/stripe.ts`.
- **Email:** Resend SDK for transactional emails (OTP, password reset).
- **Env validation:** `@t3-oss/env-core` wrapping Zod in `apps/hono-api/src/env.ts`. `ALLOWED_ORIGINS` is a JSON string auto-parsed. `SKIP_ENV_VALIDATION=true` disables checks for CI.

### Middleware Chain (hono-api)

Four middleware guards in `src/lib/middleware/`, applied in order:

1. **`requireTenantAuth()`** — validates Better Auth session, resolves tenant subdomain from headers (priority: `X-Tenant-Slug` > `Origin`/`Referer`/`X-Forwarded-Host` > `Host`), verifies user is an active member. Sets `c.set("auth", ...)`.
2. **`requireRole(minRole)`** — composable guard with numeric rank: `operator=1 < admin=2 < super_admin=3`.
3. **`checkBillingStatus()`** — gates requests based on Stripe subscription status (`active`, `trialing`, `past_due`, `canceled`, etc.). Some statuses allow reads but block writes; expired trials only allow billing endpoints for `super_admin`.
4. **`requireApiKeyAuth()`** — for widget/public API routes. Validates `Bearer dk_(live|test)_[32chars]` + `X-App-Id` header. Optionally validates `Origin` against registered domain.
5. **`createTenantRateLimitMiddleware()`** — three chained windows (per-second, per-minute, per-hour) using in-memory store (not Redis — not shared across instances).

### Account Lifecycle State Machine

**All status-based conditionals must live in `src/lib/accountLifecycle.ts`** — any status check outside this file is a bug. This controls login outcomes, signup actions, and slug reuse rules based on user/org status (`ACTIVE`, `PENDING_VERIFICATION`, `EXPIRED`, `DELETED`).

### Tenant Resolution

Subdomain resolution priority in `requestContext.ts` + `tenant.ts`:
1. `X-Tenant-Slug` header (explicit)
2. `Origin` → `Referer` → `X-Forwarded-Host` → `Host` (derived)
3. Special handling: `localhost` → no tenant; `*.localhost` → strip suffix; `*.vercel.app` → parse `[tenant]---[hash]` format; `api`/`api-dev`/`www` → no tenant.

### Frontend (admin)

- **Hono RPC client:** `hc<APIType>(baseUrl)` in `src/lib/api.ts` provides compile-time type safety for all API calls. `APIType` is imported from `hono-api`. Route changes in hono-api automatically surface as TypeScript errors in admin.
- **Request headers:** Every RPC call auto-injects `Authorization: Bearer <token>` and `X-Tenant-Slug: <subdomain>` via a custom fetch wrapper.
- **Routing:** TanStack Router with file-based routes. `_public/` = unauthenticated, `_system/` = authenticated+tenant-scoped.
- **Data fetching:** TanStack Query v5 — do NOT use `useEffect` for data fetching or state sync. Use URL search params (via `nuqs` or native APIs) for UI state like filters, tabs, modals.
- **Forms:** React Hook Form + Zod resolvers.
- **Feature structure:** `src/features/` — each feature has `components/`, `hooks/`, `lib/`, `types/`, and `docs/` subdirectories.

### Widget

- **Dual build:** Standard React Router app for dev + Vite IIFE build (`vite.embed.config.ts`) for production.
- **Embed artifacts:** `apps/widget/dist-embed/widget.iife.js`.
- **Command queue pattern:** Before the script loads, `window.DeliveryChat.init(opts)` calls are queued and replayed on boot (same pattern as Segment/Intercom).
- **Shadow DOM isolation:** Widget renders inside a Shadow DOM to prevent CSS leakage in both directions.
- **Settings priority:** API-fetched (`/widget/settings`) → `defaultSettings` → caller's `InitOptions` (JS options win last).
- **Public API:** `DeliveryChat.init({ appId })` and `DeliveryChat.destroy()`.

### Secrets Management

All environment variables managed via **Infisical** (not `.env` files). Folder-based organization:
- `/hono-api/`, `/admin/`, `/web/`, `/widget/`
- Dev scripts use `infisical run --path=/[app]` to inject secrets.
- Must run `infisical login` before development.

### Shared Packages

- **`@repo/types`** — intentionally thin: `registrationSchema`, `DOMAIN_REGEX`, `HTTP_STATUS`. The Hono RPC type (`APIType`) is the primary cross-app contract — do not duplicate API response types here.
- **`@repo/ui`** — shadcn-based components. Always use these instead of raw HTML elements.

## Conventions

- **Package manager:** Bun (v1.2.20). Always use `bun` instead of `npm`/`yarn`/`pnpm`.
- **Shared types:** Import from `@repo/types` — never duplicate type definitions across apps.
- **UI components:** Import from `@repo/ui` for shared components.
- **Path aliases:** `@repo/types`, `@repo/ui`, `hono-api` configured in root `tsconfig.json`.
- **API responses:** Use `jsonError()` for errors. Standardized response envelopes from `@repo/types`.
- **Testing:** Vitest — `hono-api` uses `node` env, `widget` uses `jsdom` env (only `src/widget/**/*.test.ts`). Tests colocated with source files.
- **Formatting:** Prettier + ESLint. Run `bun run lint` and `bun run format`.
- **Feature docs:** Every new feature or non-trivial change must have a `docs/` folder inside its feature directory with `.md` files covering business rules and technical decisions.
- **Factory docs:** When creating a Factory, add a `factory.md` in that feature's `docs/` folder.

## Git Workflow

- **Main branch:** `main` (production)
- **Development branch:** `development` (active work)
- Feature branches merge into `development`, then `development` merges into `main`.
