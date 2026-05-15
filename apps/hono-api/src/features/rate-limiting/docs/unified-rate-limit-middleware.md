# Unified Rate Limit Middleware

## Purpose

`createUnifiedRateLimitMiddleware()` is a route-level middleware that applies the correct rate limiter based on the caller's auth type. It reads the `unifiedAuth` context set by `requireAuth()` and delegates to either the tenant limiter or the visitor limiter.

## Behavior

| Auth Type | Limiter               | Key                           | Limits Source                                       |
| --------- | --------------------- | ----------------------------- | --------------------------------------------------- |
| `member`  | Tenant (per-org)      | `tenant:{orgId}`              | DB/plan-based (via `getRateLimitsForTenant`)        |
| `visitor` | Visitor (per-visitor) | `visitor:{appId}:{visitorId}` | Static (`VISITOR_RATE_LIMITS` from `planLimits.ts`) |

## Bucket Isolation

Visitor and tenant buckets are completely independent. A visitor exhausting their rate limit has zero effect on the tenant's bucket. This prevents abuse from anonymous users impacting authenticated team members.

## Usage

Applied once at route level with `.use("*", createUnifiedRateLimitMiddleware())` on conversation routes. Replaces the previous pattern of per-endpoint `createTenantRateLimitMiddleware()` calls on member-only endpoints (which left dual-auth endpoints unprotected).

## 429 Response Shape

Both paths return the standardized response from `rateLimitFactory`:

```json
{
  "error": "Rate limit exceeded",
  "cause": "per_tenant" | "per_visitor",
  "retryAfter": 60,
  "window": "second" | "minute" | "hour"
}
```

## Prerequisites

Must run after `requireAuth()` — the middleware reads `unifiedAuth` from Hono context. If called without auth context, behavior is undefined.
