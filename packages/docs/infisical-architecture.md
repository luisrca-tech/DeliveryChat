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

**Project URL**: https://app.infisical.com/organizations/61ddf519-8069-49e0-adba-0031e5fa957b/projects/secret-management/138b9de2-a089-44ca-a3a2-04047daf0bb5

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

```bash
infisical init
```

When prompted:
- **Project ID**: `138b9de2-a089-44ca-a3a2-04047daf0bb5`
- **Environment**: `dev` (for local dev)

This creates a `.infisical.json` file (git-ignored) that links your local setup to the Infisical project.

### 4. Per-App Configuration

Each app has its own `infisical.json` file that specifies the secret path:

- `apps/hono-api/infisical.json` - path: `/hono-api`, env: `dev`
- `apps/admin/infisical.json` - path: `/admin`, env: `dev`
- `apps/web/infisical.json` - path: `/web`, env: `dev`
- `apps/widget/infisical.json` - path: `/widget`, env: `dev`

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

1. Navigate to your project: https://app.infisical.com/.../138b9de2-a089-44ca-a3a2-04047daf0bb5
2. Select the folder (e.g., `/hono-api`)
3. Select the environment (e.g., `dev`)
4. Click "Add Secret"
5. Enter secret name (e.g., `DATABASE_URL`) and value
6. **Important**: Use the direct connection string format (e.g., `postgresql://...`), not commands like `psql 'postgresql://...'`
7. Save

### Via CLI

```bash
# Add a secret to /hono-api/dev
infisical secrets set DATABASE_URL "postgresql://..." --env=dev --path=/hono-api

# Add a secret to /hono-api/prod
infisical secrets set DATABASE_URL "postgresql://..." --env=prod --path=/hono-api
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
   - Go to Infisical Dashboard → Project Settings → Service Tokens
   - Create a new token with access to required folders/environments
   - Store token securely in your CI/CD platform (GitHub Secrets, etc.)

2. **In CI/CD Pipeline**:
   ```bash
   # Set service token
   export INFISICAL_TOKEN="your-service-token"
   
   # Run build/deploy with secrets injected
   infisical run --env=prod --path=/hono-api -- npm run build
   ```

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
- `INFISICAL_TOKEN` - Service token with access to the required folders/environments

**Note**: For most use cases, prefer `infisical run` in CI/CD pipelines. Only use the SDK helper when runtime secret fetching is necessary (e.g., serverless cold starts, dynamic environments).

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
|--------|-------------|---------------|
| `DATABASE_URL` | PostgreSQL connection string (direct format: `postgresql://...`) | dev, staging, prod |

### Future Secrets

As the application grows, you may add:

- `/hono-api/`: `JWT_SECRET`, `PORT`, `API_KEY`
- `/admin/`: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`
- `/widget/`: `API_ENDPOINT`, `PUBLIC_KEY`
- `/web/`: `API_BASE_URL`

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
4. Test manually: `infisical run --env=dev --path=/hono-api -- env | grep DATABASE_URL`
5. Verify DATABASE_URL format: Should be direct connection string (`postgresql://...`), not `psql 'postgresql://...'`

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
1. Verify you're using the correct environment: `--env=dev` (not `development`)
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
infisical run --env=dev --path=/hono-api -- bun run dev
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

