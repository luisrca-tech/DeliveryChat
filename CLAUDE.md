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
```

## Architecture Key Points

### Backend (hono-api)

- **Auth:** Better Auth v1.4.7 with plugins: `emailAndPassword`, `bearer`, `emailOTP`, `organization`. Roles: `super_admin`, `admin`, `operator`. Config at `apps/hono-api/src/lib/auth.ts`.
- **Database:** PostgreSQL + Drizzle ORM. Schema files in `apps/hono-api/src/db/schema/`. Key tables: `user`, `organization`, `member`, `applications`, `apiKeys`, `tenantRateLimits`.
- **Tenant plans:** `FREE`, `BASIC`, `PREMIUM`, `ENTERPRISE` with plan-based feature limits defined in `src/lib/planLimits.ts`.
- **Routes:** Composed in `src/lib/api.ts`. Route files in `src/routes/` (register, verifyEmail, users, applications, apiKeys, billing, rateLimits, webhooks, widget, tenants).
- **Middleware:** Custom middleware in `src/lib/middleware/` for request context, CORS, tenant isolation, auth checks.
- **Billing:** Stripe integration — webhooks handled in `src/routes/webhooks.ts`, client in `src/lib/stripe.ts`.
- **Email:** Resend SDK for transactional emails (OTP, password reset).
- **Env validation:** Zod schema in `apps/hono-api/src/env.ts`.

### Frontend (admin)

- **Routing:** TanStack Router with file-based routes.
- **Data fetching:** TanStack Query v5 for server state.
- **Forms:** React Hook Form + Zod resolvers.
- **Deployment:** Cloudflare Workers via Wrangler.
- **Feature-based structure:** Each feature has `components/`, `hooks/`, `lib/`, `types/` subdirectories.

### Widget

- **Dual build:** Standard React Router app for dev + Vite IIFE build (`build:embed`) for production embedding.
- **Embed artifacts:** `apps/widget/dist-embed/widget.iife.js` — the file companies load on their sites.

### Secrets Management

All environment variables managed via **Infisical** (not `.env` files). Folder-based organization:
- `/hono-api/`, `/admin/`, `/web/`, `/widget/`
- Dev scripts use `infisical run --path=/[app]` to inject secrets.
- Must run `infisical login` before development.

## Key Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `BETTER_AUTH_SECRET` — Auth secret (min 32 chars)
- `BETTER_AUTH_URL` — Auth base URL
- `RESEND_API_KEY` — Email service
- `STRIPE_SECRET_KEY`, `SIGNING_STRIPE_SECRET_KEY` — Stripe billing
- `VITE_API_URL` — API URL for frontend apps
- `ALLOWED_ORIGINS` — JSON array of allowed CORS origins

## Conventions

- **Package manager:** Bun (v1.2.20). Always use `bun` instead of `npm`/`yarn`/`pnpm`.
- **Shared types:** Import from `@repo/types` — never duplicate type definitions across apps.
- **UI components:** Import from `@repo/ui` for shared components.
- **Path aliases:** `@repo/types`, `@repo/ui`, `hono-api` configured in root `tsconfig.json`.
- **API responses:** Use standardized response envelopes from `@repo/types`.
- **Testing:** Vitest for both backend (node env) and frontend. Tests colocated with source files.
- **Formatting:** Prettier + ESLint. Run `bun run lint` and `bun run format`.

## Git Workflow

- **Main branch:** `main` (production)
- **Development branch:** `development` (active work)
- Feature branches merge into `development`, then `development` merges into `main`.
