# Infisical Architecture Guide

## Overview

This document describes how secrets are managed in the Delivery Chat monorepo using Infisical. All sensitive data (API keys, database URLs, authentication tokens) are stored securely in Infisical and loaded at runtime.

## Architecture

### Single Project with Folder Structure

We use a **single Infisical project** (`delivery-chat`) with folder-based organization:

```
Infisical Project: delivery-chat
├── /hono-api/          # Backend API secrets
│   ├── dev              # Local development environment
│   ├── staging          # Staging environment
│   └── prod             # Production environment
├── /admin/             # Admin dashboard secrets
│   ├── dev
│   ├── staging
│   └── prod
├── /web/               # Landing page secrets
│   ├── dev
│   ├── staging
│   └── prod
└── /widget/            # Widget iframe secrets
    ├── dev
    ├── staging
    └── prod
```

### Why This Structure?

- **Single Project**: Easier to manage, single source of truth
- **Folder Separation**: Each app has isolated secrets
- **Environment Layers**: Automatic environment-based secret loading
- **Scalable**: Easy to add new apps or tenants later

## Setting Up Infisical

### 1. Install Infisical CLI

```bash
# Using npm
npm install -g @infisical/cli

# Or using npx (no global install needed)
npx @infisical/cli login
```

### 2. Login to Infisical

```bash
infisical login
```

This will open your browser to authenticate. After successful login, your credentials are stored locally.

### 3. Initialize Project

At the monorepo root:

When prompted:

- **Project ID**: `138b9de2-a089-44ca-a3a2-04047daf0bb5`
- **Environment**: `dev` (for local dev)

This creates a `.infisical.json` file (git-ignored) that links your local setup to the Infisical project.

### 4. Per-App Configuration

Each app has its own `infisical.json` file that specifies the secret path:

- `apps/hono-api/infisical.json` - path: `/hono-api`
- `apps/admin/infisical.json` - path: `/admin`
- `apps/web/infisical.json` - path: `/web`
- `apps/widget/infisical.json` - path: `/widget`

**Note**: The environment is detected automatically by Infisical from your `.infisical.json` configuration or `NODE_ENV`.

When you run `infisical run` from within an app directory, it automatically uses the local `infisical.json` config.

### 5. Verify Setup

```bash
# Test loading secrets (from app directory)
cd apps/hono-api
infisical run -- env | grep DATABASE_URL
```

You should see your `DATABASE_URL` secret printed. The `infisical.json` file in the app directory automatically configures the path and environment.

## Adding Secrets to Infisical Dashboard

### Via Dashboard UI

1. Navigate to your project: https://app.infisical.com/[project]
2. Select the folder (e.g., `/hono-api`)
3. Select the environment (e.g., `dev`)
4. Click "Add Secret"
5. Enter secret name (e.g., `DATABASE_URL`) and value
6. **Important**: Use the direct connection string format, **not** shell commands or environment variable references.

   **Correct formats:**
   - `postgresql://username:password@hostname:5432/database_name`
   - `postgres://username:password@hostname:5432/database_name`

   **Incorrect formats:**
   - `psql 'postgresql://...'` (shell command)
   - `$DATABASE_URL` (variable reference)
   - `@hostname:5432/database_name` (missing protocol/credentials)

7. Save

### Via CLI

```bash
# Add a secret to /hono-api/dev
infisical secrets set DATABASE_URL "postgresql://user:password@host:5432/database" --env=dev --path=/hono-api

# Add a secret to /hono-api/prod
infisical secrets set DATABASE_URL "postgresql://user:password@host:5432/database" --env=prod --path=/hono-api

# Remember: Use direct connection string format, not shell commands or variable references
```

## Local Development Workflow

### Running Apps with Infisical

The Infisical CLI automatically injects secrets as environment variables when you run commands. Each app has an `infisical.json` file that configures the secret path:

```bash
# Hono API
cd apps/hono-api
infisical run -- bun run dev
# Automatically uses apps/hono-api/infisical.json config

# Admin Dashboard
cd apps/admin
infisical run -- bun run dev
# Automatically uses apps/admin/infisical.json config
```

### How It Works

1. `infisical run` reads the local `infisical.json` file (or uses CLI flags)
2. Authenticates using your local credentials (from `infisical login`)
3. Fetches secrets from the specified folder/environment
4. Injects them as environment variables into `process.env`
5. Runs your command with those env vars available

Your code just uses `process.env.DATABASE_URL` - no SDK calls needed for local development!

## Production Deployment

### Option 1: CI/CD with Service Tokens (Recommended)

1. **Create Service Token**:
   - Go to Infisical Dashboard → **Project Settings** → **Service Tokens**
   - Click **Create Service Token**

   **Configuration options:**
   - **Service Token Name**: Any descriptive name (e.g., `production-deploy`, `ci-cd-token`, `vercel-production`). The name is for identification only.
   - **Environment**: Select the environments the token will have access to:
     - ✅ **Option 1 (Recommended)**: Single token with access to `development`, `staging`, and `production` — simpler to manage
     - ✅ **Option 2**: Separate tokens per environment (more secure, least privilege)
   - **Secrets Path**:
     - ❌ Do not use `/` (grants access to ALL paths — too dangerous)
     - **Option A (Recommended for monorepo)**: Add multiple paths for all apps:
       - `/hono-api`
       - `/admin`
       - `/web`
       - `/widget`
       - This allows the same token to access secrets from all apps
     - **Option B (More secure)**: Create separate tokens, one per app:
       - Token 1: `/hono-api` only
       - Token 2: `/admin` only
       - Token 3: `/web` only
       - Token 4: `/widget` only
       - Configure different tokens in Vercel for each app/project
   - **Expiration**: `Never` is acceptable for deployment tokens (or set a long expiration)
   - **Permissions**:
     - ✅ **Read** is sufficient for deployments (CI/CD only needs to read secrets, not write)
     - ❌ **Write** only if the deployment needs to create/update secrets (rare, not recommended)
   - Copy the generated token (you'll only see it once!)
   - Store token securely in your CI/CD platform (GitHub Secrets, Vercel Environment Variables, Railway, etc.)

2. **In CI/CD Pipeline or Deployment Platform**:
   - **Add as environment variable** in your deployment platform (GitHub Actions, Vercel, Railway, etc.):
     - Variable name: `INFISICAL_TOKEN`
     - Variable value: `your-copied-service-token`
   - No need to add it in your code or `.env` files (never commit tokens!)

   ```bash
   # In CI/CD, the token is automatically available from environment variables
   # Your scripts already use 'infisical run' which detects INFISICAL_TOKEN automatically
   npm run build  # or bun run build
   ```

**Important**:

- ✅ **For monorepo with multiple apps**: Create **one Service Token** with access to all app paths (`/hono-api`, `/admin`, `/web`, `/widget`)
- ✅ Add `INFISICAL_TOKEN` as environment variable in your **deployment platform** (not in code)
- ✅ The same token works for all apps - each app will only access its own path via `infisical.json`
- ❌ Don't add it to `.env` files or commit it to git
- ✅ For **local development**: You don't need it (use `infisical login` instead)

**Why one token works for all apps?**

- Each app has its own `infisical.json` file specifying the path (e.g., `/hono-api`)
- When you run `infisical run --path=/hono-api`, it only accesses secrets from that specific path
- The token just needs permission to read from those paths, but the app code controls which path it accesses

### Option 2: SDK Runtime Loading (Optional)

For serverless or containerized deployments where you can't use `infisical run`, use the minimal SDK helper:

```typescript
import { getSecrets } from "@repo/infisical";

// Load secrets at startup
// Path should start with /, environment: "dev" | "staging" | "prod"
const secrets = await getSecrets("/hono-api", "prod");
const dbUrl = secrets.DATABASE_URL;
```

**Required environment variables** (set in your deployment platform):

- `INFISICAL_PROJECT_ID` - Your Infisical project ID
- **Authentication** (choose one method):

  **Option A: Service Token (Recommended - Simplest) ✅**
  - `INFISICAL_TOKEN` - Service token from Infisical dashboard
  - **How to get**:
    1. Go to **Project Settings** > **Service Tokens** (project level)
    2. Click **Create Service Token**
    3. Copy the generated token
  - **Advantage**: Simplest approach — single token, created directly in the project
  - **Use case**: Automated deployments, CI/CD, serverless

  **Option B: Universal Auth (Machine Identity)**
  - `INFISICAL_CLIENT_ID` - Client ID from Machine Identity
  - `INFISICAL_CLIENT_SECRET` - Client Secret from Machine Identity
  - **How to get**:
    1. Go to **Organization Settings** > **Access Control** > **Identities** (organization level)
    2. Click **Create Identity** and select **Universal Auth**
    3. Generate **Client Secret** and copy `Client ID` and `Client Secret`
    4. Add the identity to your project: **Project Settings** > **Access Control** > **Machine Identities**
  - **Use case**: When you need more granular control and auditing

  **Local Development (`infisical login`):**
  - For local development, use `infisical login` in your terminal
  - This authenticates you personally and the SDK can use those credentials automatically
  - **Does not work in production/deployments** — local development only

**Note**: Use the SDK helper only when `infisical run` cannot be used (e.g., in serverless cold starts or dynamic environments). In standard CI/CD pipelines, prefer `infisical run` to inject secrets at build or deploy time.

## Database Migrations with Drizzle

All Drizzle commands automatically use Infisical to load `DATABASE_URL`:

```bash
# Generate migrations
cd apps/hono-api
bun run db:generate

# Run migrations
bun run db:migrate

# Push schema directly (development)
bun run db:push

# Open Drizzle Studio
bun run db:studio
```

All these commands use `infisical run` internally, so `DATABASE_URL` is automatically loaded from Infisical.

## Current Secrets

### `/hono-api/` Folder

| Secret | Description | Environments |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (`postgresql://user:password@host:port/database`) | dev, staging, prod |
| `BETTER_AUTH_SECRET` | Better Auth session encryption key (min 32 chars) | dev, staging, prod |
| `BETTER_AUTH_URL` | Base API URL for Better Auth callbacks | dev, staging, prod |
| `RESEND_API_KEY` | Resend API key for transactional emails | dev, staging, prod |
| `RESEND_EMAIL_TO` | Destination for enterprise contact emails | dev, staging, prod |
| `EMAIL_FROM` | Custom sender address (optional, falls back to default) | dev, staging, prod |
| `STRIPE_SECRET_KEY` | Stripe secret key for billing | dev, staging, prod |
| `SIGNING_STRIPE_SECRET_KEY` | Stripe webhook signing secret | dev, staging, prod |
| `STRIPE_BASIC_PRICE_KEY` | Stripe price ID for Basic plan | dev, staging, prod |
| `STRIPE_PREMIUM_PRICE_KEY` | Stripe price ID for Premium plan | dev, staging, prod |
| `STRIPE_ENTERPRISE_PRODUCT_KEY` | Stripe product ID for Enterprise plan | dev, staging, prod |
| `STRIPE_AUTOMATIC_TAX_ENABLED` | Enable Stripe automatic tax (`"true"`/`"false"`) | dev, staging, prod |
| `ALLOWED_ORIGINS` | JSON array of allowed CORS origins | dev, staging, prod |
| `PORT` | Server port (optional) | dev, staging, prod |

### `/admin/` Folder

| Secret | Description | Environments |
| --- | --- | --- |
| `VITE_API_URL` | Backend API URL | dev, staging, prod |
| `VITE_RESEND_EMAIL_TO` | Enterprise contact email (client-side) | dev, staging, prod |

### `/widget/` and `/web/` Folders

| Secret | Description | Environments |
| --- | --- | --- |
| `VITE_API_URL` | Backend API URL | dev, staging, prod |

## Team Member Access Control

### Adding Team Members

1. Go to Infisical Dashboard → Project Settings → Members
2. Invite team member by email
3. Assign role:
   - **Viewer**: Can read secrets
   - **Member**: Can read/write secrets
   - **Admin**: Full project access

### Best Practices

- **Principle of Least Privilege**: Only grant access to folders/apps team members need
- **Use Service Tokens for CI/CD**: Don't share personal credentials
- **Rotate Secrets Regularly**: Update secrets periodically
- **Audit Access**: Review who has access to sensitive secrets

## Troubleshooting

### "DATABASE_URL is not set" Error

**Cause**: Secrets not loaded from Infisical

**Solutions**:

1. Ensure you're logged in: `infisical login`
2. Verify project is initialized: Check `.infisical.json` exists
3. Confirm secret exists in dashboard: Check `/hono-api/dev` folder
4. Test manually: `infisical run --path=/hono-api -- env | grep DATABASE_URL`
5. Verify DATABASE_URL format: Should be direct connection string (`postgresql://user:password@host:port/database`), not shell commands like `psql 'postgresql://...'`

### "Authentication failed" Error

**Cause**: Expired or invalid credentials

**Solutions**:

1. Re-login: `infisical login`
2. Check token expiration in dashboard
3. Verify project ID is correct in root `.infisical.json`
4. For SDK usage, verify `INFISICAL_TOKEN` is set correctly

### Secrets Not Updating

**Cause**: Cached credentials or wrong environment

**Solutions**:

1. Verify you're using the correct environment in Infisical dashboard (dev, staging, prod)
2. Check folder path is correct: `--path=/hono-api` (with leading slash)
3. Clear Infisical cache: `infisical logout && infisical login`

## Migration from Docker/Env Files

### Before (Docker-based)

```bash
# Used Docker container for local DB
docker-compose up -d postgres
export DATABASE_URL="postgresql://localhost:5432/delivery_chat"
```

### After (Infisical)

```bash
# Use remote development database from Infisical
infisical run --path=/hono-api -- bun run dev
# DATABASE_URL automatically injected

# Or use the dev script which already includes Infisical:
cd apps/hono-api
bun run dev
```

### Benefits

- ✅ No local Docker setup needed
- ✅ Consistent database across team
- ✅ Easy environment switching (dev/staging/prod)
- ✅ Centralized secret management
- ✅ Audit trail of secret access

## Related Documentation

- [Multi-Tenant Secrets Strategy](./multi-tenant-secrets-strategy.md) - Future patterns for tenant-specific secrets
- [Infisical Official Docs](https://infisical.com/docs) - Complete Infisical documentation
