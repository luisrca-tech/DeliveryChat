# TODO — Global Test-Mode Toggle on the Tenant

> Deferred alternative captured during the test-applications work
> (`feature/test-applications-and-conflict-handling`). **Not shipped.**

## Context

The shipped model treats `kind` as a per-application property: a tenant
holds N production applications and M test applications side-by-side, each
with its own keys, origin rule, and AI context. See
[Test Applications](../applications/test-applications.md) for the
implemented behavior.

A Stripe-style alternative was considered and intentionally deferred: a
**global test-mode toggle on the tenant** — one switch on the tenant
record that flips every application, key, and dashboard view between live
and test, with shared resources mirrored across both modes.

## Why we didn't ship this

The per-application kind shipped because:

- It composes cleanly with the existing `applications` table — one enum,
  one nullable column, two partial unique indexes. No new tables, no
  fan-out of every resource.
- A tenant admin can keep production traffic flowing while iterating on a
  test app **in the same dashboard session**. The Stripe model forces a
  global switch and hides the other half of your data on every flip.
- Keys, AI context, conversations, and settings are already
  application-scoped. Adding a second axis (tenant-mode × app-id) would
  double-key half the schema for very little gain.
- The `apiKey.environment` enum already exists. The per-app kind binds to
  it at the creation boundary without a schema redesign.

The Stripe model is the right shape when **every resource** must mirror
itself across live/test (customers, charges, subscriptions, webhooks,
products). DeliveryChat's resource graph is shallower; the per-app kind
covers the actual need.

## What the alternative would touch

If we ever flip to the global toggle, it would land roughly here:

- **Schema** — `organization.activeMode: 'live' | 'test'` (or a tenant-scoped
  session flag). Every domain-bearing table (`applications`, `apiKey`,
  `conversation`, `message`, `aiContext`, `tenantRateLimits`,
  `subscription` mirroring, billing fixtures) gets a `mode` column or a
  parallel test-side row. Indexes and uniqueness constraints become
  composite on `(mode, …)`.
- **Middleware** — `requestContext` resolves the active mode and feeds it
  into every tenant-scoped query. `requireTenantAuth` returns a
  mode-aware auth context. `checkBillingStatus` continues to apply only
  in live mode.
- **Origin matcher** — drop the per-app port-pin; localhost requests
  authenticate against any test-mode key when the tenant is in test mode.
  The widget would need to know which mode it was minted under (already
  encoded in the key prefix).
- **API-key minting** — `environment` becomes a function of the tenant
  mode at creation time, not the parent app's `kind`. The
  `assertApiKeyEnvironmentMatchesApp` helper goes away or inverts.
- **Billing** — Stripe customers/subscriptions stay live-only; test-mode
  usage is free and not metered. The dashboard hides billing surfaces in
  test mode.
- **Admin UI** — global mode switcher in the topbar; every list and
  detail page filters by `mode`. Settings editors need a "this only
  affects test mode" warning. Onboarding flows change shape.
- **Documentation** — every guide that references applications, keys,
  conversations, or billing needs a mode disclaimer.

In short: a vertical slice through the whole product instead of a single
table.

## Signal that would justify revisiting

We should re-open this design only if **all three** of the following
hold:

1. A non-trivial number of tenants ask for an explicit "test mode"
   experience that mirrors more than just applications — typically
   conversations and AI context — without contaminating production
   dashboards.
2. The per-application kind starts producing dashboard clutter
   (e.g. customers ship 5+ test apps each and the applications list
   becomes unusable).
3. Billing/observability needs to draw a hard line between live and test
   usage for compliance or pricing reasons (e.g. excluding test traffic
   from quotas, SOC reports, or AI-call billing).

Any one of those alone is solvable with smaller iterations: better
filtering in the list view, a `kind=test` filter on dashboards, a usage
exclusion in the billing pipeline. Three together would mean the
per-app kind is doing two jobs at once and a tenant-level mode is
genuinely cheaper.

## Until then

The per-application kind is the supported model. Document it, surface it
in the admin UI, and bind API keys at the creation boundary. If the
signal above appears, this TODO is the starting point for a follow-up
plan.
