# Webhook Route Split

## Overview

The monolithic `routes/webhooks.ts` (544 lines) has been split into a folder-based structure at `routes/webhooks/`. Each handler file exports plain async functions (not Hono routes) dispatched from a single `POST /stripe` handler in `index.ts`.

## Folder Structure

```
routes/webhooks/
  index.ts          # POST /stripe dispatcher: verify → deduplicate → dispatch → emails
  utils.ts          # Shared helpers: signature verification, idempotency dedup, plan extraction, money formatting
  types.ts          # HandlerContext, Transaction, EmailTask types
  subscription.ts   # customer.subscription.created, updated, deleted
  invoice.ts        # invoice.paid, invoice.payment_failed
  checkout.ts       # checkout.session.completed
  __tests__/
    helpers.ts            # Shared test factories and mock setup
    utils.test.ts         # 7 tests for pure utility functions
    subscription.test.ts  # 6 tests for subscription event handlers
    invoice.test.ts       # 1 test for invoice event handlers
    checkout.test.ts      # 2 tests for checkout event handlers
```

## Handler Pattern

Each handler file exports plain async functions that receive:

1. The Stripe event data object (typed via `Stripe.Invoice`, `Stripe.Subscription`, etc.)
2. A `HandlerContext` containing `tx` (database transaction) and `emailTasks` (deferred email queue)

Handlers do not construct HTTP responses. The dispatcher in `index.ts` owns the full request lifecycle:

1. Verify Stripe signature
2. Check idempotency (insert into `processedEvents`)
3. Open a database transaction
4. Dispatch to the correct handler by `event.type`
5. On transaction failure, rollback the processed event record
6. Execute deferred email tasks outside the transaction

## Utils Module

- `extractPlanFromMetadata()` — safely extracts and validates plan from Stripe metadata
- `formatMoney()` — converts cents to dollar string (e.g., 2900 → "29.00")
- `verifyStripeSignature()` — verifies the `stripe-signature` header against the webhook secret
- `deduplicateEvent()` — inserts event ID into `processedEvents` to prevent reprocessing
- `rollbackProcessedEvent()` — deletes the processed event record on transaction failure

## Design Decisions

- **No `customer.ts`**: there are no standalone customer-level events handled; all subscription events live in `subscription.ts`
- **Email tasks are deferred**: handlers push closures to `emailTasks[]` during the transaction, but emails are sent after the transaction commits successfully — this prevents sending emails for rolled-back changes
- **Handlers are pure functions**: they don't touch `Context` or return responses, making them independently testable with just a mock transaction
