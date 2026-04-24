# Rate Limiting Feature

## Business Rules

- Per-tenant rate limits apply to all API requests that identify a tenant (via session or API key).
- Limits are configurable per plan: FREE, BASIC, PREMIUM, ENTERPRISE.
- ENTERPRISE tenants can set custom overrides via the admin dashboard.
- When a tenant exceeds a limit, the request returns 429 with `Retry-After` header.
- Alerts are sent via email when limits are exceeded (max 1 per tenant per window type per hour).
- Resend OTP has separate endpoint-specific limits: 1/60s, 5/hour, 10/day per email.

## Per-Visitor Rate Limiting

- Per-visitor limits apply to widget endpoints (`/v1/widget/conversations*`) to prevent a single abuser from draining a tenant's budget.
- Keyed by `(appId, visitorId)` — two visitors under the same tenant have independent budgets.
- Fixed limits (not plan-dependent): 3/second, 30/minute, 200/hour.
- Composed with (not replacing) the per-tenant limiter: both apply independently.
- 429 response body includes `cause: "per_visitor"` to distinguish from per-tenant rate limiting.
- Requests without `X-App-Id` or `X-Visitor-Id` headers bypass visitor rate limiting (handled by widget auth rejection).

## Technical Decisions

- **Storage**: In-memory (MemoryStore) for v1. Redis migration path via hono-rate-limiter RedisStore.
- **Multi-window**: Three hono-rate-limiter instances chained (1s, 60s, 3600s). First failure returns 429.
- **Alert deduplication**: `rate_limit_alerts_sent` table; skip if last sent < 1 hour ago for same tenant+window.
- **Visitor rate limit placement**: Applied as `.use()` on widget conversation routes, before `requireWidgetAuth()`. Same chain pattern as tenant rate limiter.
