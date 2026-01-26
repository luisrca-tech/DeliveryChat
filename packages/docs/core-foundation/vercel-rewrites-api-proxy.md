# Vercel Edge Rewrites for API Proxying (Admin App)

This document explains the production proxy strategy for the `apps/admin` frontend in the delivery-chat monorepo.

## Problem Statement

The Admin app needs to call the Hono API while:

- keeping **cookies first-party** (to avoid third‑party cookie issues and simplify auth)
- supporting **multi-tenant routing by subdomain** (the API derives tenant from the request host)
- avoiding performance overhead from running a JavaScript proxy (Middleware) on every API request

Previously, `apps/admin` used a Vercel `middleware.ts` to proxy `/api/*` to Render on every request.

## High-Level Solution

Use **Vercel external rewrites** (Edge-level reverse proxy) so:

- the browser always calls same-origin endpoints like `https://<tenant>.domain.com/api/...`
- Vercel forwards these calls to the real API upstream (Render)
- no custom Middleware runs on every request

To avoid hardcoding the Render upstream URL in git, we use **programmatic Vercel config** (`vercel.mjs`) and read the upstream from an environment variable.

## How Requests Flow

### Browser (always same-origin)

Admin code calls relative paths:

- REST/API: `GET /api/v1/...`
- Better Auth: `POST /api/auth/...`

This keeps cookies first-party.

### Vercel Edge Rewrite (production / preview deployments)

Vercel rewrites forward:

- `/api/v1/:path*` → `${HONO_API_UPSTREAM}/v1/:path*`
- `/api/auth/:path*` → `${HONO_API_UPSTREAM}/api/auth/:path*`

The upstream is a public Hono API deployment, typically on Render.

## Environment Variables

### Required on Vercel/Infisical (server-side, build/deploy time)

- `HONO_API_UPSTREAM`
  - **Production**: `https://deliverychat-production.onrender.com`
  - **Preview/Dev deploy**: `https://deliverychat-development.onrender.com`

This is the only value the rewrite layer needs in production.

### Optional for local development (Vite dev server)

- `VITE_API_URL`
  - If set, the local Vite proxy forwards to this URL
  - If not set, local proxy defaults to `http://localhost:8000`

## Implementation Details

### Vercel config file

`apps/admin/vercel.mjs` defines the rewrites and reads the upstream from `process.env`:

```js
import process from "node:process";

const upstream = process.env.HONO_API_UPSTREAM;
// rewrites: /api/v1/* -> upstream/v1/*, /api/auth/* -> upstream/api/auth/*
```

Notes:

- `process` is imported explicitly to satisfy tooling/lint rules in this repo.
- We use `vercel.mjs` instead of `vercel.json` to avoid committing upstream URLs.

### Removed per-request Middleware

The previous Vercel Middleware proxy (`apps/admin/middleware.ts`) was removed to eliminate per-request runtime overhead in production deployments.

### Backend route mapping (Hono)

The Hono API exposes:

- `app.route("/v1", api)` for v1 endpoints
- `app.all("/api/auth/*", ...)` for Better Auth routes

So the Admin rewrite rules intentionally map:

- `/api/v1/*` → `/v1/*`
- `/api/auth/*` → `/api/auth/*`

## Why This Improves Performance

Compared to a custom Middleware proxy:

- **no “middleware boot/execution” per request**
- rewrites are handled in the **Vercel Edge network** as part of routing
- typically better connection reuse / proxy optimizations vs. per-request userland fetch

This is most noticeable on pages that make multiple API calls.

## Local Development Strategy

Recommended defaults:

- Run API locally on `http://localhost:8000`
- Admin runs locally on `http://localhost:3000`
- Use the local Vite proxy (same-origin from the browser’s point of view)

If you want to point local Admin to a remote API (Render dev), set:

- `VITE_API_URL=https://deliverychat-development.onrender.com`

## Validation Checklist (Deploy)

After deployment:

1. **Network tab**
   - requests should be to `https://<tenant>.<domain>/api/...` (same-origin)
   - auth requests should go to `/api/auth/...`
2. **Cookies**
   - cookie should be set and sent on subsequent `/api/*` requests
3. **Tenant resolution**
   - confirm the API resolves tenant correctly from the request host (subdomain)
4. **No Middleware executions**
   - verify the deployment is not running the legacy proxy middleware

## Troubleshooting

### Login loops / “unauthorized” after deploy

- Confirm `HONO_API_UPSTREAM` is set for the correct Vercel environment (Production vs Preview).
- Check that the rewritten endpoints match the backend’s routes:
  - `/api/v1/*` must map to `/v1/*`
  - `/api/auth/*` must remain `/api/auth/*`

### Tenant not found / wrong tenant

- Confirm the upstream receives the original host (subdomain) and that your tenant resolution logic uses forwarded host headers where appropriate.

## Security Notes

- The upstream URL (Render) is not a secret by itself.
- Secrets remain in Infisical/Vercel env vars (database URLs, auth secrets, API keys).
- Avoid caching auth endpoints. Do **not** add CDN caching for `/api/auth/*`.
