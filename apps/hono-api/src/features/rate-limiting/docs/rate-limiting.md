# Rate Limiting Feature

## Business Rules

- Per-tenant rate limits apply to all API requests that identify a tenant (via session or API key).
- Limits are configurable per plan: FREE, BASIC, PREMIUM, ENTERPRISE.
- ENTERPRISE tenants can set custom overrides via the admin dashboard.
- When a tenant exceeds a limit, the request returns 429 with `Retry-After` header.
- Alerts are sent via email when limits are exceeded (max 1 per tenant per window type per hour).
- Resend OTP has separate endpoint-specific limits: 1/60s, 5/hour, 10/day per email.

## Technical Decisions

- **Storage**: In-memory (MemoryStore) for v1. Redis migration path via hono-rate-limiter RedisStore.
- **Multi-window**: Three hono-rate-limiter instances chained (1s, 60s, 3600s). First failure returns 429.
- **Alert deduplication**: `rate_limit_alerts_sent` table; skip if last sent < 1 hour ago for same tenant+window.
