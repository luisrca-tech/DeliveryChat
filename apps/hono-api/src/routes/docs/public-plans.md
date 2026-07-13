# Public plans endpoint

`GET /api/v1/public/plans` — public marketing data, **no auth, no tenant
resolution**. Registered as `publicRoute` in `src/routes/public.ts`, mounted
in `src/lib/api.ts` under `/public`.

## Why it exists

Two consumers:

1. **The marketing site / registration flow** can show live pricing without
   any tenant context.
2. **Dogfooding as an AI DataTool.** This is the first HTTP DataTool
   (`features/ai-data/`) that DeliveryChat registers against its own API, so
   the widget's AI assistant can answer "how much does it cost?" from live
   data instead of a hardcoded answer baked into the system prompt. See the
   "Dogfooding" section in
   `apps/hono-api/src/features/ai-data/docs/data-tool-management.md` for how
   it is wired up as a tool named `getPlanInfo`.

## Response shape

```json
{
  "plans": [
    {
      "id": "FREE",
      "name": "Free",
      "prices": null,
      "limits": { "apiKeys": 3, "members": 3, "aiAssistant": false, "aiMonthlyCap": 0 }
    },
    {
      "id": "BASIC",
      "name": "Basic",
      "prices": {
        "brl": { "amount": 9000, "formatted": "R$ 90/month" },
        "usd": { "amount": 1900, "formatted": "$19/month" }
      },
      "limits": { "apiKeys": 5, "members": 6, "aiAssistant": false, "aiMonthlyCap": 0 }
    },
    { "id": "PREMIUM", "...": "same shape as BASIC" },
    {
      "id": "ENTERPRISE",
      "name": "Enterprise",
      "prices": "custom",
      "limits": { "apiKeys": 1000, "members": 1000, "aiAssistant": true, "aiMonthlyCap": 3000 }
    }
  ]
}
```

- `limits` are the small, public-safe subset of `src/lib/planLimits.ts`
  (`API_KEY_LIMITS`, `MEMBER_LIMITS`, `AI_LIMITS`) — no rate-limit internals.
- `FREE.prices` is always `null` (no paid plan). `ENTERPRISE.prices` is
  always the string `"custom"` (billing is manual, no Stripe price object).
- `BASIC` / `PREMIUM` prices are fetched live from Stripe
  (`STRIPE_BASIC_PRICE_KEY` / `STRIPE_PREMIUM_PRICE_KEY`) with
  `expand: ["currency_options"]`, reading the `brl` amount from the price's
  default currency and the `usd` amount from `currency_options.usd` (falling
  back to the top-level `unit_amount`/`currency` if the price's default
  currency happens to be `usd`).

## Caching

- **In-memory, module-level, ~10 minute TTL** (`CACHE_TTL_MS` in
  `public.ts`). No new infra (no Redis) — this mirrors the "boring on
  purpose" bias used elsewhere in the codebase (e.g. the in-memory rate
  limiter stores) and is acceptable because a stale price for a few minutes
  on a marketing endpoint has no correctness impact.
- **Stripe failure never 500s.** The error is logged
  (`console.error`) and the endpoint serves the **stale cache** if one
  exists, or `prices: null` for BASIC/PREMIUM if there is no cache yet.
  `limits` are always served (they never depend on Stripe).
- The HTTP response also sets `Cache-Control: public, max-age=300` (5 min),
  mirroring the pattern used by `GET /widget/settings/:appId`.

## Rate limiting

Reuses `sharedVisitorRateLimiter` (`createVisitorRateLimitMiddleware`, the
same limiter instance the widget's visitor routes use). There is no
tenant/visitor identity on this endpoint, so it always falls through to the
limiter's IP-based key (`visitor-ip:<ip>`) — the closest existing fit without
adding new shared infrastructure. No dedicated public/anonymous limiter
exists in `lib/middleware/`; introducing one was out of scope for this
marketing endpoint.
