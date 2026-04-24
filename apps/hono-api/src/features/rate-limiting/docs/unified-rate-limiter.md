# Unified Rate Limiter

## Problem

`rateLimit.ts` (tenant) and `visitorRateLimit.ts` (visitor) duplicate ~50 lines of identical infrastructure:
- The recursive middleware chain that threads 3 `hono-rate-limiter` instances (per-second, per-minute, per-hour)
- Store allocation (one `MemoryStore` per window)
- 429 response formatting (with divergent shapes — tenant returns `currentLimit`, visitor returns `cause` and `window`)

This duplication means any fix to the chain pattern must be applied in two places, and clients must parse two different 429 response schemas.

## Solution

Extract a single `createRateLimiter` factory in `lib/middleware/rateLimitFactory.ts` that hides:
- The 3-window `hono-rate-limiter` instantiation
- The recursive middleware chain
- `MemoryStore` allocation
- A standardized 429 response shape

Both `createTenantRateLimitMiddleware` and `createVisitorRateLimitMiddleware` become thin wrappers that configure the factory with their scope-specific logic (key generation, limit resolution, skip conditions, exceeded callbacks).

## Interface

```typescript
createRateLimiter(opts: {
  cause: string;
  limits: RateLimitConfig | ((c: Context) => Promise<RateLimitConfig>);
  keyGenerator: (c: Context) => string | null;
  onExceeded?: (c: Context, window: RateLimitWindow, limit: number) => void;
}): MiddlewareHandler
```

## Standardized 429 Response

```json
{
  "error": "Rate limit exceeded",
  "cause": "per_tenant" | "per_visitor",
  "retryAfter": 60,
  "window": "minute"
}
```

## What Remains Scope-Specific

- **Tenant limiter:** async limit resolution from DB/cache, `onExceeded` callback for alert recording
- **Visitor limiter:** static limits, key from `X-App-Id` + `X-Visitor-Id` headers, skip when headers missing

## Technical Decisions

- `keyGenerator` returning `null` means "skip this request" — the factory generates a unique bypass key and sets `skip: true`.
- `limits` accepts either a static config or an async resolver, so the tenant limiter can fetch from DB while the visitor limiter passes a constant.
- The factory owns `MemoryStore` lifecycle — one set of stores per factory call, shared across all requests routed through that middleware instance.
