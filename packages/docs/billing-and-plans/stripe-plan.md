#  Delivery Chat: High-Reliability Stripe Integration (v1)

## 1. Architectural Foundation & API v1 (✅ Complete)

* **Versioning:** All Hono routes prefixed with `/v1`.
* **Client Sync:** `BASE_URL` updated in Web and Admin apps.

## 2. Database Resilience (Drizzle + Postgres) (✅ Complete)

* **Organization Schema:** Updated with `stripe_customer_id`, `plan_status`, etc.
* **Idempotency:** `processed_events` table created to prevent duplicate webhook processing.

## 3. Webhook Handler & Atomic Transactions (✅ Complete)

* **Endpoint:** `POST /v1/webhooks/stripe` implemented.
* **Logic:** Signature verification, idempotency check, and database transactions for `invoice.paid`, `invoice.payment_failed`, and `subscription.deleted`.

---

## 4. RBAC + Billing Middleware (✅ Complete)

Implement a Hono middleware `checkBillingStatus` to enforce business rules based on `planStatus` and `memberRoleEnum`.

### Enforcement Rules:

* **Active / Trialing:** Full access for all roles.
* **Past_due (Soft Block):**
* **All Roles:** Allow `GET` (read-only) and `DELETE` (cost management). Block `POST/PUT` (no new messages/actions).
* **Super Admin UI:** Display "Fix Billing" button/banner.
* **Others UI:** Display "Contact Super Admin" banner.


* **Unpaid / Canceled (Hard Block):** * Redirect all roles to `/billing` or a blocked state.
* Only `super_admin` can access the route to generate a Stripe Portal session.



---

## 5. The "Hybrid" Enterprise Workflow

* **Logic:** Enterprise tier bypasses Stripe Checkout.
* **Trigger:** `planType === 'enterprise'` triggers **Resend** email via `RESEND_EMAIL_TO`.
* **Payload:** Include Org Name, Admin Email, and Member Count.
* **Destination:** `luisrochacruzalves@gmail.com`.

---

## 6. Edge Case Handling (Technical Specifications)

* **A. The "Zombie Checkout":** Frontend `/success` page must **poll** `GET /v1/billing/status` every 2s until `planStatus` is updated by the webhook.
* **B. Global Tax:** Enable `automatic_tax` and `billing_address_collection` in all Stripe Checkout sessions.

---

## 7. Admin Project: Recovery & UI Policy

* **Status Banners:** * If `past_due`, show a persistent `Alert`.
* **Super Admin Only:** Show "Update Payment Method" button.


* **Portal Strategy:** `POST /v1/billing/portal-session` must verify `role === 'super_admin'` before creating a session.

---

### Instructions for Cursor:

**Environment Reference:**

* **Hono API:** `STRIPE_SECRET_KEY`, `SIGNING_STRIPE_SECRET_KEY`, `STRIPE_BASIC_PRICE_KEY`, `STRIPE_PREMIUM_PRICE_KEY`, `STRIPE_ENTERPRISE_PRODUCT_KEY`, `RESEND_EMAIL_TO`.
* **Web/Admin:** `PUBLIC_STRIPE_KEY` / `VITE_STRIPE_KEY`.

**Action Items:**

1. **Step 4:** ✅ Build the `checkBillingStatus` middleware. Use the `memberRoleEnum` to provide specific error messages ("Contact Super Admin" vs "Update Billing"). *(Complete)*
2. **Step 5:** Implement the Enterprise email trigger logic in the billing router.
3. **Step 6:** Update the Admin Dashboard UI to show/hide billing management buttons based on the user's role.