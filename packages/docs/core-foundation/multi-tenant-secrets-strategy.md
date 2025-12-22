# Multi-Tenant Secrets Strategy

## Overview

This document outlines strategies for managing tenant-specific secrets in the Delivery Chat multi-tenant system. Each company (tenant) may need their own API keys, authentication tokens, and integration credentials.

## Current Infrastructure Secrets

### Global Secrets (Infisical: `/hono-api`)

The following secrets are configured globally for the entire application:

- **BETTER_AUTH_SECRET**: Better Auth session encryption key (min 32 characters)
- **BETTER_AUTH_URL**: Base API URL for Better Auth callbacks
- **DATABASE_URL**: PostgreSQL connection string
- **RESEND_API_KEY**: Resend API key for transactional emails
- **EMAIL_FROM**: (Optional) Custom sender email address (e.g., `"Delivery Chat <onboarding@deliverychat.online>"`)
  - Falls back to `"Delivery Chat <onboarding@resend.dev>"` if not set
  - Used for OTP verification and password reset emails
- **NODE_ENV**: Environment (`development`, `staging`, `production`)
- **PORT**: (Optional) Server port

These are infrastructure-level secrets used by the application itself, not specific to any tenant.

## Use Cases for Tenant-Specific Secrets

Examples of tenant-specific secrets:

- **Stripe API Keys**: Each company processes payments with their own Stripe account
- **SendGrid API Tokens**: Companies send emails through their own SendGrid accounts
- **Custom Integration Keys**: Third-party service API keys per tenant
- **Webhook Secrets**: Unique webhook signing secrets per company
- **OAuth Credentials**: Social login credentials per tenant

## Strategy Comparison

### Strategy A: Infisical Dynamic Folders

**Architecture**: Create a folder per tenant in Infisical

```
Infisical Project: delivery-chat
├── /hono-api/              # Infrastructure secrets
│   ├── BETTER_AUTH_SECRET
│   ├── BETTER_AUTH_URL
│   ├── DATABASE_URL
│   ├── RESEND_API_KEY      # Global email service
│   ├── EMAIL_FROM          # Global sender address
│   ├── NODE_ENV
│   └── PORT
├── /admin/
├── /widget/
└── /tenants/               # Tenant-specific secrets
    ├── /codewiser/         # Company subdomain
    │   ├── STRIPE_SECRET_KEY
    │   ├── SENDGRID_API_KEY  # If tenant wants their own email service
    │   └── CUSTOM_API_KEY
    ├── /acmecorp/
    │   ├── STRIPE_SECRET_KEY
    │   └── SENDGRID_API_KEY
    └── /another-company/
        └── ...
```

**Implementation**:

```typescript
import { getSecrets } from "@repo/infisical";

// Load tenant-specific secret
async function getTenantSecret(
  companySubdomain: string,
  secretKey: string,
  environment: "dev" | "staging" | "prod" = "dev",
): Promise<string | undefined> {
  const secrets = await getSecrets(`/tenants/${companySubdomain}`, environment);
  return secrets[secretKey];
}

// Usage
const stripeKey = await getTenantSecret(
  "codewiser",
  "STRIPE_SECRET_KEY",
  "prod",
);
```

**Pros**:

- ✅ Centralized management in Infisical UI
- ✅ Easy to add/edit secrets per tenant
- ✅ Built-in audit trail
- ✅ No database schema changes needed
- ✅ Simple implementation

**Cons**:

- ❌ API call per tenant lookup (latency)
- ❌ Rate limits at scale (1000s of tenants)
- ❌ Requires Infisical API access in production
- ❌ Slower than database lookups

**Best For**: MVP, < 100 tenants, low-frequency secret access

---

### Strategy B: Database Encryption with Infisical Master Key

**Architecture**: Store encrypted tenant secrets in PostgreSQL, decrypt with master key from Infisical

```
Database Table: company_secrets
├── company_id (uuid, FK to companies)
├── secret_key (varchar) - e.g., "stripe_secret_key"
├── secret_value_encrypted (text) - AES-256 encrypted
└── created_at, updated_at

Infisical: /hono-api/
├── MASTER_ENCRYPTION_KEY    # For tenant secrets encryption
├── RESEND_API_KEY            # Global infrastructure
├── EMAIL_FROM                # Global sender
└── ... (other global secrets)
```

**Implementation**:

```typescript
import { getSecrets } from "@repo/infisical";
import crypto from "crypto";
import { db } from "./db";
import { companySecrets } from "./schema";

// Get master encryption key from Infisical
async function getMasterKey(
  environment: "dev" | "staging" | "prod" = "dev",
): Promise<string> {
  const secrets = await getSecrets("/hono-api", environment);
  const key = secrets.MASTER_ENCRYPTION_KEY;
  if (!key) throw new Error("MASTER_ENCRYPTION_KEY not found");
  return key;
}

// Encrypt tenant secret
async function encryptSecret(value: string): Promise<string> {
  const masterKey = await getMasterKey();
  const iv = crypto.randomBytes(12); // 12 bytes for GCM
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(masterKey, "hex"),
    iv,
  );
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${encrypted}:${authTag}`;
}

// Decrypt tenant secret
async function decryptSecret(encryptedValue: string): Promise<string> {
  const masterKey = await getMasterKey();
  const [ivHex, encrypted, authTagHex] = encryptedValue.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(masterKey, "hex"),
    iv,
  );
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Store tenant secret
async function setTenantSecret(
  companyId: string,
  secretKey: string,
  secretValue: string,
): Promise<void> {
  const encrypted = await encryptSecret(secretValue);
  await db
    .insert(companySecrets)
    .values({
      companyId,
      secretKey,
      secretValueEncrypted: encrypted,
    })
    .onConflictDoUpdate({
      target: [companySecrets.companyId, companySecrets.secretKey],
      set: { secretValueEncrypted: encrypted },
    });
}

// Retrieve tenant secret
async function getTenantSecret(
  companyId: string,
  secretKey: string,
): Promise<string | null> {
  const secret = await db.query.companySecrets.findFirst({
    where: (secrets, { eq, and }) =>
      and(eq(secrets.companyId, companyId), eq(secrets.secretKey, secretKey)),
  });

  if (!secret?.secretValueEncrypted) return null;

  return await decryptSecret(secret.secretValueEncrypted);
}
```

**Database Schema**:

```typescript
// packages/db/src/schema/company-secrets.ts
import { text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { createTable } from "../table";
import { companies } from "./companies";

export const companySecrets = createTable(
  "company_secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    secretKey: varchar("secret_key", { length: 255 }).notNull(),
    secretValueEncrypted: text("secret_value_encrypted").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueCompanySecret: unique().on(table.companyId, table.secretKey),
  }),
);
```

**Pros**:

- ✅ Fast database lookups (no API calls)
- ✅ Scales to thousands of tenants
- ✅ Works offline (no external API dependency)
- ✅ Can cache decrypted secrets in memory
- ✅ Supports bulk operations

**Cons**:

- ❌ Need to build UI for secret management
- ❌ More complex implementation
- ❌ Requires database migration
- ❌ Master key rotation is complex

**Best For**: Production at scale, > 100 tenants, high-frequency access

---

## Recommended Approach

### Phase 1: MVP (< 100 Tenants)

**Use Strategy A (Infisical Folders)**

- Quick to implement
- No database changes
- Easy secret management via Infisical UI
- Sufficient performance for small scale

**Implementation Steps**:

1. Create `/tenants/{subdomain}/` folders in Infisical
2. Add secrets per tenant via dashboard
3. Implement `getTenantSecret()` helper function
4. Use in API routes when tenant context is available

**Example API Route**:

```typescript
// apps/hono-api/src/routes/payments.ts
app.post("/api/payments/create", async (c) => {
  const company = await getCompanyFromRequest(c);
  const stripeKey = await getTenantSecret(
    company.subdomain,
    "STRIPE_SECRET_KEY",
  );

  // Use stripeKey for payment processing
});
```

---

### Phase 2: Scale (> 100 Tenants)

**Migrate to Strategy B (Database Encryption)**

When you hit performance issues or need better scalability:

1. **Create Migration**:
   - Add `company_secrets` table
   - Export secrets from Infisical folders
   - Encrypt and import into database

2. **Update Code**:
   - Replace `getTenantSecret()` with database-backed version
   - Add caching layer for frequently accessed secrets
   - Build admin UI for secret management

3. **Gradual Migration**:
   - Keep Infisical folders as backup
   - Migrate tenants in batches
   - Monitor performance improvements

---

## Hybrid Approach (Advanced)

Combine both strategies:

- **Infisical Folders**: For secrets that change frequently or need UI management
- **Database Encryption**: For high-frequency secrets (cache in memory)

```typescript
async function getTenantSecret(
  companySubdomain: string,
  secretKey: string,
  useCache = true,
): Promise<string | undefined> {
  // Check in-memory cache first
  if (useCache) {
    const cached = secretCache.get(`${companySubdomain}:${secretKey}`);
    if (cached) return cached;
  }

  // Try database first (fast)
  const dbSecret = await getTenantSecretFromDB(companySubdomain, secretKey);
  if (dbSecret) {
    secretCache.set(`${companySubdomain}:${secretKey}`, dbSecret);
    return dbSecret;
  }

  // Fallback to Infisical (slower, but always up-to-date)
  const infisicalSecret = await getTenantSecretFromInfisical(
    companySubdomain,
    secretKey,
  );
  if (infisicalSecret) {
    // Optionally sync to database for next time
    await setTenantSecretInDB(companySubdomain, secretKey, infisicalSecret);
    return infisicalSecret;
  }

  return undefined;
}
```

---

## Security Considerations

### Master Key Management

- **Store in Infisical**: `/hono-api/MASTER_ENCRYPTION_KEY` (for tenant-specific secrets only)
- **Rotate Regularly**: Update master key every 90 days
- **Key Derivation**: Use PBKDF2 or Argon2 for key derivation
- **Backup**: Store encrypted backup of master key

### Infrastructure Secrets

- **BETTER_AUTH_SECRET**: Rotate every 90 days, invalidates all existing sessions
- **RESEND_API_KEY**: Rotate if compromised, monitor usage in Resend dashboard
- **EMAIL_FROM**: Verify domain ownership in Resend before use
- **DATABASE_URL**: Use connection pooling, rotate credentials periodically

### Access Control

- **Tenant Isolation**: Ensure secrets are scoped to company_id
- **API Authorization**: Verify company ownership before secret access
- **Audit Logging**: Log all secret access attempts
- **Rate Limiting**: Prevent brute force attacks
- **Infisical Access**: Limit who can access `/hono-api` folder (infrastructure team only)

### Encryption Best Practices

- **Use AES-256-GCM**: Authenticated encryption mode
- **Unique IVs**: Never reuse initialization vectors
- **Key Rotation**: Support key versioning for rotation
- **Secure Deletion**: Overwrite memory after use

---

## Migration Path: Infisical → Database

When ready to migrate from Strategy A to Strategy B:

### Step 1: Export Secrets from Infisical

```typescript
// Migration script: scripts/migrate-secrets-to-db.ts
import { getSecrets } from "@repo/infisical";

async function exportTenantSecrets() {
  const tenants = ["codewiser", "acmecorp" /* ... */];

  for (const tenant of tenants) {
    const secrets = await getSecrets(`/tenants/${tenant}`, "prod");

    for (const [secretKey, secretValue] of Object.entries(secrets)) {
      await setTenantSecret(tenant, secretKey, secretValue);
    }
  }
}
```

### Step 2: Verify Migration

- Compare counts: Infisical secrets vs. database records
- Spot-check decrypted values
- Test API endpoints with migrated secrets

### Step 3: Update Code

- Replace Infisical calls with database lookups
- Add caching layer
- Monitor performance metrics

### Step 4: Cleanup (Optional)

- Keep Infisical folders as backup for 30 days
- Archive old secrets
- Update documentation

---

## Future Enhancements

### Secret Versioning

Track secret history for audit and rollback:

```typescript
company_secrets
├── id
├── company_id
├── secret_key
├── secret_value_encrypted
├── version (increment on update)
└── previous_version_id (FK to self)
```

### Secret Rotation Automation

- Scheduled rotation for expiring secrets
- Webhook notifications for rotation events
- Automatic API key regeneration

### Multi-Region Support

- Replicate encrypted secrets across regions
- Region-specific master keys
- Compliance with data residency requirements

---

## Related Documentation

- [Auth Integration Guide](./auth/auth-integration.md) - Better Auth setup with email verification
- [Better Auth Multi-Tenant Study Guide](./auth/better-auth-multi-tenant-study-guide.md) - Account lifecycle and authentication flows
- [Database Schema](../hono-api/src/db/schema/) - Database structure

## Email Service Configuration

### Current Setup (Global Resend)

Currently, the application uses a single Resend account for all email sending:

- **OTP Verification Emails**: Sent during user registration
- **Password Reset Emails**: Sent with tenant-specific reset URLs
- **Sender Address**: Configurable via `EMAIL_FROM` environment variable

### Future: Per-Tenant Email Service

If you need tenants to send emails from their own domains:

**Option 1**: Multiple Resend API keys (one per tenant)
- Store tenant's `RESEND_API_KEY` in database (encrypted) or Infisical folder
- Initialize Resend client per-request based on tenant
- Each tenant verifies their domain in Resend

**Option 2**: SMTP per tenant
- Store SMTP credentials (host, port, username, password) encrypted in DB
- Use nodemailer or similar with tenant-specific config
- Tenants use their own email infrastructure

**Option 3**: SendGrid per tenant (similar to Resend)
- Store SendGrid API keys per tenant
- Tenants verify domains in their SendGrid accounts

This would follow the same pattern as Strategy A or B above for managing these credentials.
