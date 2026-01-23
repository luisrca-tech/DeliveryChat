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

## 5. The "Hybrid" Enterprise Workflow

- **Logic:** Enterprise tier bypasses Stripe Checkout.
- **Trigger:** `planType === 'enterprise'` triggers **Resend** email via `RESEND_EMAIL_TO`.
- **Payload:** Include Org Name, Admin Email, and Member Count.
- **Destination:** `luisrochacruzalves@gmail.com`.

---

## 6. Edge Case Handling & Success Polling

- **A. The "Zombie Checkout" (Frontend/Backend Sync):**
- **Backend:** Implement `GET /v1/billing/status` to return `{ planStatus: string, isReady: boolean }`.
- **Frontend:** The `/success` page must **poll** this endpoint every 2s using a recursive fetch logic.
- **Redirect:** Do not show the "Success" UI or redirect to the dashboard until `isReady` is true (status is `active` or `trialing`).

- **B. Global Tax & Compliance:** \* In all `stripe.checkout.sessions.create` calls, include:
- `automatic_tax: { enabled: true }`
- `customer_update: { address: 'auto' }`
- `billing_address_collection: 'required'`

---

## 7. Admin Project: RBAC & UI Policy

- **Status Banners:**
- If `planStatus === 'past_due'`, show a persistent `Alert` banner in the `RootLayout`.
- **Super Admin Logic:** Banner includes a "Fix Billing" button.
- **Operator Logic:** Banner displays "Read-only mode: Contact Super Admin to resolve payment."

- **Billing Management Page:**
- **RBAC:** Only `super_admin` can access the billing settings page.
- **Portal Strategy:** `POST /v1/billing/portal-session` must verify `role === 'super_admin'` before generating a session.
- **Enterprise UI:** If the organization is on an Enterprise plan, replace the "Manage" buttons with a message: _"Custom Plan: Contact luisrochacruzalves@gmail.com for changes."_

---

### Instructions for Cursor:

**Environment Reference:**

- **Hono API:** `STRIPE_SECRET_KEY`, `SIGNING_STRIPE_SECRET_KEY`, `STRIPE_BASIC_PRICE_KEY`, `STRIPE_PREMIUM_PRICE_KEY`, `STRIPE_ENTERPRISE_PRODUCT_KEY`, `RESEND_EMAIL_TO`.
- **Web/Admin:** `PUBLIC_STRIPE_KEY` / `VITE_STRIPE_KEY`.

**Action Items:**

1. **Step 4:** ✅ Build the `checkBillingStatus` middleware. Use the `memberRoleEnum` to provide specific error messages ("Contact Super Admin" vs "Update Billing"). _(Complete)_
2. **Step 5:** Implement the Enterprise email trigger logic in the billing router.
3. **Step 6:** Create the `GET /v1/billing/status` endpoint in Hono. Then, build the polling logic on the Web project's `/success` page to ensure the DB has synced before the user moves on.
4. **Step 7:** Implement the Global Alert banner in the Admin project. Ensure the "Fix Billing" button only appears for the `super_admin` role.
5. **Step 7.2:** Protect the Billing Settings route so only Super Admins can access it and trigger the Stripe Portal.
