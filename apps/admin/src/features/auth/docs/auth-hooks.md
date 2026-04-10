# Auth Hooks — Business Rules & Technical Decisions

## Problem

Route `beforeLoad` guards were making blocking API calls (auth session + billing status) before every navigation, causing ~800ms-1.6s delays in production. The SSR pass skipped these calls (`if window === undefined return`), so all fetching happened client-side in a sequential waterfall.

## Solution

Replaced blocking `beforeLoad` API calls with non-blocking TanStack Query hooks.

### useAuthSession

- Combines `getSession()` + `organization.list()` + `organization.setActive()` into a single cached query.
- Query key: `["auth", "session"]` — stable across navigations.
- `staleTime: 60s` — avoids redundant re-fetches during normal usage.
- Returns `null` when session is invalid or organization doesn't match subdomain.
- Consumed by `_system.tsx` layout (auth guard) and components that need user/org data.

### useRequireRole

- Consumes `useBillingStatusQuery()` (already existed, `staleTime: 15s`).
- Checks if user role is in the allowed list.
- Navigates to `/` if unauthorized (non-blocking, component-level).
- Used by route components that require admin/super_admin access.

## Navigation Flow (After)

```
beforeLoad: token exists in sessionStorage? (sync, ~0ms)
  → no: redirect to /login (instant)
  → yes: render layout with loading state
    → useAuthSession fires (cached after first load)
    → useBillingStatusQuery fires (cached, shared across routes)
    → component renders with data
```

## Key Decision: Token Check vs Session Validation

The `beforeLoad` only checks for token existence (sync). Full session validation happens in `useAuthSession`. This means an expired token will briefly show the loading state before redirecting — acceptable tradeoff for instant navigation.

## Query Key Fix

`SettingsIndexPage` was using `["billing-status"]` while `useBillingStatusQuery` uses `["billingStatus"]` — two separate caches for the same data. Fixed by using `useBillingStatusQuery()` everywhere.
