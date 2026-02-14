# Delivery Chat: High-Reliability Stripe Integration (v1)

## 1. Architectural Foundation & API v1 (✅ Complete)

- **Versioning:** All Hono routes prefixed with `/v1`.
- **Client Sync:** `BASE_URL` updated in Web and Admin apps.

## 2. Database Resilience (Drizzle + Postgres) (✅ Complete)

- **Organization Schema:** Updated with `stripe_customer_id`, `plan_status`, etc.
- **Idempotency:** `processed_events` table created to prevent duplicate webhook processing.

## 3. Webhook Handler & Atomic Transactions (✅ Complete)

- **Endpoint:** `POST /v1/webhooks/stripe` implemented.
- **Logic:** Signature verification, idempotency check, and database transactions for `invoice.paid`, `invoice.payment_failed`, and `subscription.deleted`.

---

## 4. RBAC + Billing Middleware (✅ Complete)

Implement a Hono middleware `checkBillingStatus` to enforce business rules based on `planStatus` and `memberRoleEnum`.

### Enforcement Rules:

- **Active / Trialing:** Full access for all roles.
- **Past_due (Soft Block):**
- **All Roles:** Allow `GET` (read-only) and `DELETE` (cost management). Block `POST/PUT` (no new messages/actions).
- **Super Admin UI:** Display "Fix Billing" button/banner.
- **Others UI:** Display "Contact Super Admin" banner.

- **Unpaid / Canceled (Hard Block):** \* Redirect all roles to `/billing` or a blocked state.
- Only `super_admin` can access the route to generate a Stripe Portal session.

---

## 5. The "Hybrid" Enterprise Workflow (✅ Complete)

- **Logic:** Enterprise tier bypasses Stripe Checkout.
- **Trigger:** `planType === 'enterprise'` triggers **Resend** email via `RESEND_EMAIL_TO`.
- **Payload:** Include Org Name, Admin Email, and Member Count.
- **Destination:** `RESEND_EMAIL_TO` (configured in Infisical).

---

## 6. Trial Control + "Zombie Checkout" Polling (✅ Complete)

### Backend support

- **Trial persistence:** `organization.trial_ends_at` added (migration `0011_add_trial_ends_at.sql`) and exposed as `trialEndsAt`.
- **Internal 14-day trial:** On organization creation we set:
  - `organization.planStatus = "trialing"`
  - `organization.trialEndsAt = now + 14 days`
  - `organization.billingEmail = user.email`
- **Stripe trial sync:** `customer.subscription.updated` persists Stripe `trial_end` into `trialEndsAt` when status is `trialing`.
- **Enforcement:** If `planStatus === "trialing"` and `trialEndsAt` is in the past:
  - Block access with `402 Payment Required`
  - Allow `super_admin` recovery routes: `/billing/checkout` and `/billing/portal-session`

### Status endpoint (polling + banners)

- **Hono API:** `GET /v1/billing/status` returns:
  - `isReady` (true only when status is `active` or non-expired `trialing`)
  - `planStatus`, `plan`, `trialEndsAt`, `role`, `cancelAtPeriodEnd`

### Polling UX ("Zombie Checkout")

- **Admin success page:** `/billing/success` implements polling (2s interval) to `GET /v1/billing/status` until `isReady === true`, then redirects to the dashboard.
- **Note:** We intentionally keep this flow in **Admin** (tenant subdomain context), not Web.

---

## 7. Admin UI (RBAC + Billing Management) (✅ Complete)

### Feature-based structure + hooks (TanStack Query)

- The Admin implementation follows a **feature-based** structure (`apps/admin/src/features/*`) with:
  - `lib/` fetchers per feature
  - `hooks/` per feature using TanStack Query (`useQuery`, `useMutation`)
  - `routes/` are thin wrappers around feature components

### Global BillingAlert banner

- Implemented in the `_system` layout using the billing status endpoint.
- **past_due:** warning banner with:
  - `super_admin`: "Fix billing" button
  - others: "Contact Admin"
- **trialing:** "Trial ends in X days" based on `trialEndsAt`
- **trial ended:** shows a recovery CTA for `super_admin` to pick a plan

### Billing settings page (super_admin only)

- Route: `/settings/billing`
- Shows plan + planStatus and:
  - **Stripe portal:** “Manage subscription” → `POST /v1/billing/portal-session`
  - **Enterprise:** hides portal and displays the contact email (`RESEND_EMAIL_TO`)

### Plan selection (onboarding)

- Route: `/onboarding/plans`
- Basic/Premium: calls `POST /v1/billing/checkout` and redirects to the Stripe Checkout URL
- Enterprise: calls `POST /v1/billing/checkout` and shows “manual review” success (Resend email is triggered)

---

### Instructions for Cursor:

**Environment Reference:**

- **Hono API:** `STRIPE_SECRET_KEY`, `SIGNING_STRIPE_SECRET_KEY`, `STRIPE_BASIC_PRICE_KEY`, `STRIPE_PREMIUM_PRICE_KEY`, `STRIPE_ENTERPRISE_PRODUCT_KEY`, `RESEND_EMAIL_TO`.
- **Admin:** `VITE_RESEND_EMAIL_TO` (exposed client-side for showing Enterprise contact email).
- **Web/Admin:** `PUBLIC_STRIPE_KEY` / `VITE_STRIPE_KEY` (optional; not required when redirecting via Checkout URL).

**Action Items:**

1. **Step 4:** ✅ Build the `checkBillingStatus` middleware. Use the `memberRoleEnum` to provide specific error messages ("Contact Super Admin" vs "Update Billing"). _(Complete)_
2. **Step 5:** Implement the Enterprise email trigger logic in the billing router. _(Complete)_
3. **Step 6:** ✅ Add trial tracking (`trialEndsAt`), improve billing enforcement, and implement polling on Admin `/billing/success`. _(Complete)_
4. **Step 7:** ✅ Implement Admin onboarding (`/onboarding/plans`), BillingAlert, and billing settings (`/settings/billing` super*admin only). *(Complete)\_
