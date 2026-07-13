# Stripe Billing Integration

## Overview

DeliveryChat uses Stripe for subscription billing with three paid tiers (Basic, Premium, Enterprise) plus a free trial period. The integration covers webhooks, RBAC-aware billing enforcement, and a hybrid Enterprise workflow.

## Architecture

### Database Schema

The `organization` table holds all billing state:

- `stripeCustomerId` — Stripe customer ID, created on first checkout
- `stripeSubscriptionId` — Active subscription ID
- `plan` — Current plan (`FREE`, `BASIC`, `PREMIUM`, `ENTERPRISE`)
- `planStatus` — Mirrors Stripe subscription status (`active`, `trialing`, `past_due`, `canceled`, `unpaid`, `incomplete`, `paused`)
- `trialEndsAt` — Trial expiration timestamp
- `billingEmail` — Set to admin's email on org creation
- `cancelAtPeriodEnd` — Whether the subscription will cancel at period end
- `aiAddonActive` — Whether the AI add-on is active (derived from webhooks only)
- `aiAddonSubscriptionItemId` — Stripe subscription item ID of the AI add-on (derived from webhooks only)

The `processedEvents` table provides idempotency — each Stripe webhook event ID is stored to prevent duplicate processing.

### Webhook Handler

**Endpoint:** `POST /v1/webhooks/stripe`

Handles five events inside atomic database transactions:

- **`invoice.paid`** — Sets status to `active`, syncs `plan` from subscription metadata via Stripe API
- **`invoice.payment_failed`** — Sets status to `past_due`
- **`customer.subscription.created`** — Syncs `plan`, `stripeSubscriptionId`, `planStatus`, and `trialEndsAt` from the new subscription
- **`customer.subscription.deleted`** — Resets to `FREE` plan with `canceled` status
- **`customer.subscription.updated`** — Syncs `planStatus`, `trialEndsAt`, and `plan` from subscription metadata

Each event is verified via Stripe signature (`SIGNING_STRIPE_SECRET_KEY`) and checked against `processedEvents` for idempotency.

### RBAC Billing Middleware (`checkBillingStatus`)

Applied after `requireTenantAuth()`. Enforcement rules by `planStatus`:

| Status                             | Behavior                                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `active`, `trialing` (not expired) | Full access for all roles                                                                                                                              |
| `trialing` (expired)               | Block all. `super_admin` can access `/billing/checkout` and `/billing/portal-session` for recovery                                                     |
| `past_due` (soft block)            | `GET` and `DELETE` allowed (read-only + cost management). `POST`/`PUT` blocked. `super_admin` sees "Fix Billing" CTA; others see "Contact Super Admin" |
| `unpaid`, `canceled` (hard block)  | Block all. Only `super_admin` can access `/billing/portal-session`                                                                                     |
| `incomplete`, `paused`             | Block all, return 403                                                                                                                                  |

### Trial System

- On organization creation: `planStatus = "trialing"`, `trialEndsAt = now + 14 days`, `billingEmail = user.email`
- Checkout during trial: `trial_period_days` is omitted so the subscription activates immediately (no double trial). `checkout.session.completed` sets `planStatus = "active"` when the org was already trialing.
- Checkout without trial: includes `trial_period_days: 14` for first-time purchases
- Plan sync redundancy: `plan` is synced from `subscription.metadata.plan` in `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `invoice.paid` — if any single event fails, the others recover the plan tier
- Enforcement: expired trial returns `402 Payment Required`, allowing only `super_admin` recovery routes

### Multi-currency

All Stripe prices (Basic, Premium, AI add-on) carry `currency_options`, so a single price ID bills in either BRL (default) or USD:

| Plan     | BRL (default) | USD    |
| -------- | ------------- | ------ |
| Basic    | R$ 90         | US$ 19 |
| Premium  | R$ 240        | US$ 49 |
| AI add-on| R$ 120        | US$ 24 |

- `POST /v1/billing/checkout` accepts an optional `currency: "brl" | "usd"` (default `"brl"`), forwarded as the `currency` param to `stripe.checkout.sessions.create`, which selects the matching currency option. The onboarding plan cards expose a BRL/USD toggle.
- A customer's currency is **locked by their first subscription**. Later items — notably the AI add-on — automatically follow the subscription's currency, so the add-on route sends no currency of its own.
- Enterprise has no Checkout (manual flow), so currency selection does not apply to it.

## AI Add-on

The AI assistant is sold as a **purchasable add-on**, decoupled from the plan tier. Only **PREMIUM** and **ENTERPRISE** organizations are eligible to buy it. Flat R$ 120/mo (multi-currency Stripe price; US$ 24 option), single SKU.

### Item model — a second subscription item, never a second subscription

The add-on is modeled as a **second subscription item on the existing subscription** (Stripe price `STRIPE_AI_ADDON_PRICE_KEY`, `lookup_key = ai_addon_monthly`). This keeps the single-`stripeSubscriptionId` schema, one invoice, Stripe-native proration, and an independent cancel lifecycle. A second subscription would break the `status → planStatus` mapping and the single-subscription assumption.

### Entitlement is derived from webhooks only

`aiAddonActive` / `aiAddonSubscriptionItemId` are **never set directly by any route**. They are derived by scanning `subscription.items.data` in the webhook handlers:

- **`customer.subscription.created`** and **`customer.subscription.updated`** — detect the add-on item by `price.id === STRIPE_AI_ADDON_PRICE_KEY` (fallback `price.lookup_key === "ai_addon_monthly"`). Present → `aiAddonActive = true`, `aiAddonSubscriptionItemId = item.id`. Absent → `false` / `null`. The extra item never disturbs plan resolution (`extractPlanFromMetadata` is unchanged).
- **`customer.subscription.deleted`** — resets `aiAddonActive = false`, `aiAddonSubscriptionItemId = null` alongside the plan reset.

### Purchase & cancel routes

Both require `super_admin` and go through the standard billing middleware chain. Responses are `{ status: "pending" }` acknowledgements — the entitlement flips only once the resulting Stripe webhook is processed.

- **`POST /v1/billing/ai-addon`** — preconditions: org has `stripeSubscriptionId`; `planStatus ∈ {active, trialing}`; `plan ∈ {PREMIUM, ENTERPRISE}`; add-on not already active. Adds the item via `stripe.subscriptionItems.create` (default proration).
- **`DELETE /v1/billing/ai-addon`** — requires `aiAddonSubscriptionItemId`; removes it via `stripe.subscriptionItems.del` with `proration_behavior: "create_prorations"`.

### Downgrade revocation

In `customer.subscription.updated`, if the resolved plan is **not** in `{PREMIUM, ENTERPRISE}` (e.g. a downgrade to BASIC) while the add-on item is still present, the handler:

1. clears the entitlement flags immediately (for consistency), and
2. schedules a **post-commit** Stripe call (`subscriptionItems.del`, same deferred pattern as `emailTasks`) to remove the orphaned item — which itself fires a follow-up `subscription.updated`.

### Feature gates

- **`requireAiAddon()`** — plan ∈ {PREMIUM, ENTERPRISE} **and** `aiAddonActive === true`, else `403 ai_addon_not_active`. This is the single AI gate: it protects the autonomous assistant **and** the data-tools / data-connection routes (both HTTP- and SQL-backed). There is no separate ENTERPRISE-custom gate.

### Enterprise Hybrid Workflow

Enterprise tier bypasses Stripe Checkout entirely:

- When `planType === 'enterprise'`, a contact email is sent via Resend to `RESEND_EMAIL_TO`
- Payload includes: Org Name, Admin Email, Member Count
- Admin UI shows "manual review" success state instead of Stripe redirect

## Admin UI

### Billing Alert Banner (`_system` layout)

- **`past_due`**: Warning banner — `super_admin` gets "Fix billing" button, others get "Contact Admin"
- **`trialing`**: "Trial ends in X days" based on `trialEndsAt`
- **Trial ended**: Recovery CTA for `super_admin` to pick a plan

### Plan Selection (`/onboarding/plans`)

- Basic/Premium: calls `POST /v1/billing/checkout` → redirects to Stripe Checkout URL
- Enterprise: calls `POST /v1/billing/checkout` → shows "manual review" success (Resend email triggered)

### Billing Settings (`/settings/billing`, super_admin only)

- Shows current plan + status
- Stripe portal: "Manage subscription" → `POST /v1/billing/portal-session`
- Enterprise: hides portal, displays contact email

### Status Polling (`/billing/success`)

After checkout, the success page polls `GET /v1/billing/status` every 2 seconds until `isReady === true`, then redirects to dashboard. This handles the delay between Stripe webhook delivery and database update ("Zombie Checkout" pattern).

**Status endpoint returns:** `isReady`, `planStatus`, `plan`, `trialEndsAt`, `role`, `cancelAtPeriodEnd`, `aiAddonActive`

## Environment Variables

| Variable                        | App      | Purpose                                |
| ------------------------------- | -------- | -------------------------------------- |
| `STRIPE_SECRET_KEY`             | hono-api | Stripe API access                      |
| `SIGNING_STRIPE_SECRET_KEY`     | hono-api | Webhook signature verification         |
| `STRIPE_BASIC_PRICE_KEY`        | hono-api | Stripe price ID for Basic              |
| `STRIPE_PREMIUM_PRICE_KEY`      | hono-api | Stripe price ID for Premium            |
| `STRIPE_ENTERPRISE_PRODUCT_KEY` | hono-api | Stripe product ID for Enterprise       |
| `STRIPE_AI_ADDON_PRICE_KEY`     | hono-api | Stripe price ID for the AI add-on       |
| `STRIPE_AUTOMATIC_TAX_ENABLED`  | hono-api | Enable automatic tax calculation       |
| `RESEND_EMAIL_TO`               | hono-api | Enterprise contact email destination   |
| `VITE_RESEND_EMAIL_TO`          | admin    | Enterprise contact email (client-side) |
