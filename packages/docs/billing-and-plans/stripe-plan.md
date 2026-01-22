To accommodate the **`invoices`** table for historical auditing and the **Hybrid Enterprise** logic, we need to restructure **Steps 2 through 6**. This ensures that the technical depth Cursor expects is maintained while adding the "Financial Source of Truth" we discussed.

---

#  Delivery Chat: High-Reliability Stripe Integration (v1)

## 1. Architectural Foundation & API v1 (✅ Complete)

## 2. Database Resilience & Financial Audit (Drizzle + Postgres) (✅ Complete)

To ensure we never process the same payment twice and maintain a perfect historical audit trail for our tenants:

### `organization` Table Updates

**File:** `apps/hono-api/src/db/schema/organization.ts`

* `stripeCustomerId`: `varchar` (Unique)
* `stripeSubscriptionId`: `varchar`
* `planStatus`: `enum` ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'paused')
* `billingEmail`: `varchar`
* `cancelAtPeriodEnd`: `boolean` (Default: false)

### `invoices` Table (NEW)

**File:** `apps/hono-api/src/db/schema/invoices.ts`

* `id`: `varchar` (Primary Key) - Stripe Invoice ID (`in_...`).
* `organizationId`: `varchar` (FK to `organization.id`).
* `amount`: `integer` (Amount in cents).
* `currency`: `varchar` (Default: 'brl').
* `status`: `enum` ('draft', 'open', 'paid', 'uncollectible', 'void').
* `hostedInvoiceUrl`: `text` (URL to Stripe's hosted PDF receipt).
* `periodStart`: `timestamp` (Billing period start date).
* `periodEnd`: `timestamp` (Billing period end date).
* `createdAt`: `timestamp` (Default: now).

### `processed_events` Table (Idempotency)

**File:** `apps/hono-api/src/db/schema/processed_events.ts`

* `id`: `varchar` (Primary Key) - Stripe Event ID (`evt_...`).
* `createdAt`: `timestamp` (Default: now).

---

## 3. The "Hybrid" Enterprise Workflow

* **Logic:** Enterprise does not use a standard checkout redirect.
* **Trigger:** When `planType === 'enterprise'`, Hono triggers a **Resend** email to `luisrochacruzalves@gmail.com`.
* **Payload:** Include Organization Name, Admin Email, and current member count.
* **Response:** Return a `200` with `status: 'manual_review'` to the frontend.

---

## 4. Webhook Handler & Atomic Transactions

**Endpoint:** `POST /v1/webhooks/stripe`.
**Requirement:** Use a **Database Transaction** to ensure synchronization across `processed_events`, `organization`, and `invoices`.

```typescript
// Core Logic for Webhook Handler
db.transaction(async (tx) => {
  // 1. Idempotency Guard
  await tx.insert(processedEvents).values({ id: event.id }); 
  
  // 2. Event Handlers
  if (event.type === 'invoice.paid') {
     const invoice = event.data.object;
     // Update Org Status
     await tx.update(organization).set({ planStatus: 'active' }).where(...);
     // Log History
     await tx.insert(invoices).values({
        id: invoice.id,
        amount: invoice.amount_paid,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        status: 'paid'
     });
  }
  // Handle other events: invoice.payment_failed, customer.subscription.deleted, etc.
});

```

---

## 5. Edge Case Handling (Technical Specifications)

* **A. The "Zombie Checkout":** Frontend `/success` page must **poll** `GET /v1/billing/status` to check the `organization` table before showing success UI.
* **B. Billing Blocks (Middleware):** * **Soft Block (`past_due`):** Allow `GET`, block `POST` (Chat messages).
* **Hard Block (`unpaid`, `canceled`):** Redirect all routes to `/billing`.


* **C. Compliance:** Enable `automatic_tax` and `billing_address_collection: 'required'` in Checkout Sessions.

---

## 6. Admin Project: Recovery & History UI

* **Status Banners:** Display `Alert` if `past_due`.
* **Billing History (NEW):** Create a table in the Admin UI fetching from the `invoices` table. Display Date, Amount, and a "Download Receipt" link using `hostedInvoiceUrl`.
* **The "Fix Now" Portal:** Implement `POST /v1/billing/portal-session`. Configure the portal to prioritize "Immediate payment of outstanding invoices."

---

### Instructions for Cursor:

1. **Step 2:** ✅ Generate Drizzle migrations for `organization` updates, the new `invoices` table, and the `processed_events` table. *(Complete)*
2. **Step 3:** Build the Stripe Webhook using the **Atomic Transaction** pattern described above.
3. **Step 4:** Implement the `checkBillingStatus` middleware.
4. **Step 5:** Create the Billing History UI in the Admin app using the new `invoices` data.

**Environment Reference:** `STRIPE_SECRET_KEY`, `SIGNING_STRIPE_SECRET_KEY`, `STRIPE_BASIC_PRICE_KEY`, `STRIPE_PREMIUM_PRICE_KEY`, `STRIPE_ENTERPRISE_PRODUCT_KEY`, `RESEND_EMAIL_TO`.

---

**Luis, this version is perfect.** It gives Cursor a clear data model and explains exactly how the new `invoices` table interacts with the webhooks. You can now start Step 2 with full confidence!