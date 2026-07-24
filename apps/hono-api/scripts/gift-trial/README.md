# Gift-trial scripts

One-shot operational scripts to hand prospective clients a 1‑month gift account,
then fully tear them down afterwards.

> ⚠️ **These hit whatever database and Stripe account Infisical injects.** Run them
> against **production** only when you intend to. Both talk to live Stripe.

## Accounts registry

All gift-trial accounts live in **`giftTrialAccounts.ts`** (`GIFT_TRIAL_ACCOUNTS`).
Both scripts iterate over that list. To hand out a new trial, add an entry there and
run `gift-trial:create`.

## What they do

- **`create-gift-trial-org.ts`** — for each registered account, creates an organization
  + super_admin admin user that can log in immediately, with **no OTP / email
  confirmation** (the target emails are placeholders that receive no mail). The user +
  org are set to `ACTIVE` and the email is marked verified.
  - **Idempotent:** an account whose admin email OR slug already exists is **skipped**,
    so re-running only creates what's missing.
  - The password is created through Better Auth's server API (`signUpEmail`), so it is
    hashed with Better Auth's own algorithm and **login verifies correctly**. Do not
    swap this for a manual bcrypt insert.
  - The plan is intentionally left on **FREE** — buy PREMIUM + the AI add-on through
    the real Stripe checkout so a genuine subscription drives entitlement.
- **`delete-gift-trial-org.ts`** — for each registered account, resolves the org (by
  slug) and admin user (by email), cancels its Stripe subscription + customer, and
  deletes every DB row tied to the org, in foreign-key-safe order. No IDs to paste;
  accounts not found are reported and skipped.

## Usage

From `apps/hono-api`:

```bash
# Create every registered gift account that doesn't exist yet
bun run gift-trial:create
# (equivalently) infisical run --path=/hono-api -- tsx scripts/gift-trial/create-gift-trial-org.ts
```

For each created account, log in at the admin app with its credentials and **purchase
PREMIUM + the AI add-on** via Stripe checkout. The webhook flips `organization.plan` to
`PREMIUM` and `organization.aiAddonActive` to `true`.

When the gifts are over, tear down **all** registered accounts:

```bash
bun run gift-trial:delete -- --confirm
# (equivalently) infisical run --path=/hono-api -- tsx scripts/gift-trial/delete-gift-trial-org.ts --confirm
```

The delete script refuses to run without `--confirm`. To delete only some accounts,
temporarily trim `GIFT_TRIAL_ACCOUNTS` (or comment entries out) before running.

## Deletion order (why)

Some tables have no `ON DELETE CASCADE` to `organization`, and
`applicationAiContext.completedBy -> user` is `ON DELETE RESTRICT`. So per account the
order is:

1. `applications` (cascades `apiKeys`, `applicationDataSource`, `applicationDataTool`, `applicationAiContext`)
2. `visitorIdentities` (no cascade to org)
3. `organization` (cascades `member`, `conversations` → `messages`/`conversationParticipants`, `tenantRateLimits`, `rateLimitEvents`, `rateLimitAlertsSent`, `aiUsageLog`)
4. admin `user` (cascades `session`, `account`)
5. orphan anonymous visitor users (best-effort, individually)
6. `verification` rows (keyed by email identifier, not a foreign key)

## Known limitations

- Anonymous visitor users are removed on a best-effort basis; a row still referenced by
  another org is skipped and logged rather than aborting the run.
- The `processedEvents` Stripe-webhook dedup table is not FK'd to the org and is left
  untouched (harmless).
