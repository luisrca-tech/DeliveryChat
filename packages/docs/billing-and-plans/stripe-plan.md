This is the "Hardened" version of the integration plan. It combines our high-level business logic with the advanced engineering principles (Idempotency, Atomicity, and Failure Recovery).

---

# Delivery Chat: High-Reliability Stripe Integration (v1)

## 1. Architectural Foundation & API v1 (✅ Complete)

* **Versioning:** Wrap the entire Hono `apiRouter` in `app.route('/v1', apiRouter)`.
* **Endpoint Sync:** Update `apps/web/src/lib/urls.ts` and `apps/admin/src/lib/urls.ts` to append `/v1` to the `BASE_URL`.
* **Infrastructure:** All Stripe interactions must use the **Infisical** keys: `STRIPE_SECRET_KEY`, `STRIPE_BASIC_PRICE_KEY`, etc.

## 2. Database Resilience (Drizzle + Postgres) (✅ Complete)

To ensure we never process the same payment twice and maintain a perfect audit trail:

### `organization` Table Updates

Add billing metadata to `apps/hono-api/src/db/schema/organization.ts`:

* `stripeCustomerId`: `varchar` (Unique)
* `stripeSubscriptionId`: `varchar`
* `planStatus`: `enum` ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'paused')
* `billingEmail`: `varchar`
* `cancelAtPeriodEnd`: `boolean` (Default: false)

### Idempotency Table

Create a new table `processed_events`:

* `id`: `varchar` (Primary Key) - Stores the Stripe Event ID (`evt_...`).
* `createdAt`: `timestamp` (Default: now).

## 3. The "Hybrid" Enterprise Workflow

* **Logic:** Enterprise does not use a standard checkout redirect.
* **Trigger:** When `planType === 'enterprise'`, Hono triggers a **Resend** email to `luisrochacruzalves@gmail.com`.
* **Payload:** Include Organization Name, Admin Email, and current member count.
* **Response:** Return a `200` with `status: 'manual_review'` to the frontend to show a "Request Received" modal.

## 4. Webhook Handler & Atomic Transactions (✅ Complete)

Located at `POST /v1/webhooks/stripe`. This must be a **database transaction** to ensure atomicity.

```typescript
// Pseudo-logic for Cursor
db.transaction(async (tx) => {
  // 1. Idempotency Check
  await tx.insert(processedEvents).values({ id: event.id }); 
  
  // 2. Event Routing
  switch (event.type) {
    case 'invoice.paid': 
      // definitively set status to 'active'
    case 'invoice.payment_failed': 
      // set status to 'past_due' (Soft Block)
    case 'customer.subscription.updated':
      // sync 'cancel_at_period_end' and 'plan_status'
  }
});
```

## 5. Edge Case Handling (Technical Specifications)

### A. The "Zombie Checkout" (SCA/3D Secure)

* Payments may be asynchronous. The frontend `/success` page must **poll** `GET /v1/billing/status` every 2 seconds.
* Do not show the "Success" UI until `planStatus` in the DB shifts to `active` or `trialing`.

### B. Soft vs. Hard Billing Blocks (Middleware)

Implement a Hono middleware `checkBillingStatus`:

* **Soft Block (`past_due`):** Allow `GET` (reading old chats), block `POST` (sending new messages).
* **Hard Block (`unpaid`, `canceled`):** Block all dashboard access; redirect to `/billing`.

### C. Global Tax & Compliance

In the `stripe.checkout.sessions.create` call, include:

* `automatic_tax: { enabled: true }`
* `customer_update: { address: 'auto' }`
* `billing_address_collection: 'required'`

## 6. Admin Project: Recovery & Management

* **Status Banners:** If `past_due`, display a persistent `Alert` component using the `VITE_STRIPE_KEY` context.
* **The "Fix Now" Portal:** Implement `POST /v1/billing/portal-session`. If the user is `past_due`, the portal must be configured to prioritize "Immediate payment of outstanding invoices."

---

### Instructions for Cursor:

- **Hono API:** `STRIPE_SECRET_KEY`, `SIGNING_STRIPE_SECRET_KEY`, `STRIPE_BASIC_PRICE_KEY`, `STRIPE_PREMIUM_PRICE_KEY`, `STRIPE_ENTERPRISE_PRODUCT_KEY`.

- **Web/Admin:** `PUBLIC_STRIPE_KEY` / `VITE_STRIPE_KEY`.

1. **Step 1:** ✅ Refactor the Hono Router to `/v1` and update the URL constants in the Web/Admin apps. *(Complete)*
2. **Step 2:** ✅ Apply the Drizzle migrations for `organization` and `processed_events`. *(Complete)*
3. **Step 3:** ✅ Implement the Stripe Webhook with the **Atomic Transaction** pattern. *(Complete)*
4. **Step 4:** Build the "Soft Block" middleware and apply it to the message-sending routes.

Once you run the Stripe CLI (`stripe listen --forward-to localhost:3000/v1/webhooks/stripe`), you will be able to simulate a "Success" payment and watch your `organization` table update in real-time.
