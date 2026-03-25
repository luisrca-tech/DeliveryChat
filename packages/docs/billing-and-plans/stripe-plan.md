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

The `processedEvents` table provides idempotency — each Stripe webhook event ID is stored to prevent duplicate processing.

### Webhook Handler

**Endpoint:** `POST /v1/webhooks/stripe`

Handles three events inside atomic database transactions:
- **`invoice.paid`** — Updates plan and status to `active`
- **`invoice.payment_failed`** — Sets status to `past_due`
- **`customer.subscription.deleted`** — Resets to `FREE` plan
- **`customer.subscription.updated`** — Syncs `trial_end` into `trialEndsAt` when status is `trialing`

Each event is verified via Stripe signature (`SIGNING_STRIPE_SECRET_KEY`) and checked against `processedEvents` for idempotency.

### RBAC Billing Middleware (`checkBillingStatus`)

Applied after `requireTenantAuth()`. Enforcement rules by `planStatus`:

| Status | Behavior |
|---|---|
| `active`, `trialing` (not expired) | Full access for all roles |
| `trialing` (expired) | Block all. `super_admin` can access `/billing/checkout` and `/billing/portal-session` for recovery |
| `past_due` (soft block) | `GET` and `DELETE` allowed (read-only + cost management). `POST`/`PUT` blocked. `super_admin` sees "Fix Billing" CTA; others see "Contact Super Admin" |
| `unpaid`, `canceled` (hard block) | Block all. Only `super_admin` can access `/billing/portal-session` |
| `incomplete`, `paused` | Block all, return 403 |

### Trial System

- On organization creation: `planStatus = "trialing"`, `trialEndsAt = now + 14 days`, `billingEmail = user.email`
- Stripe trial sync: `customer.subscription.updated` persists Stripe `trial_end` into `trialEndsAt`
- Enforcement: expired trial returns `402 Payment Required`, allowing only `super_admin` recovery routes

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

**Status endpoint returns:** `isReady`, `planStatus`, `plan`, `trialEndsAt`, `role`, `cancelAtPeriodEnd`

## Environment Variables

| Variable | App | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | hono-api | Stripe API access |
| `SIGNING_STRIPE_SECRET_KEY` | hono-api | Webhook signature verification |
| `STRIPE_BASIC_PRICE_KEY` | hono-api | Stripe price ID for Basic |
| `STRIPE_PREMIUM_PRICE_KEY` | hono-api | Stripe price ID for Premium |
| `STRIPE_ENTERPRISE_PRODUCT_KEY` | hono-api | Stripe product ID for Enterprise |
| `STRIPE_AUTOMATIC_TAX_ENABLED` | hono-api | Enable automatic tax calculation |
| `RESEND_EMAIL_TO` | hono-api | Enterprise contact email destination |
| `VITE_RESEND_EMAIL_TO` | admin | Enterprise contact email (client-side) |
