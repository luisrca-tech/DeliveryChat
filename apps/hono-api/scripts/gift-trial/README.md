# Gift-trial scripts

One-shot operational scripts to hand a prospective client a 1‑month gift account,
then fully tear it down afterwards.

> ⚠️ **These hit whatever database and Stripe account Infisical injects.** Run them
> against **production** only when you intend to. Both talk to live Stripe.

## What they do

- **`create-gift-trial-org.ts`** — creates an organization + super_admin admin user
  that can log in immediately, with **no OTP / email confirmation** (the target email
  is a placeholder that receives no mail). The user + org are set to `ACTIVE` and the
  email is marked verified.
  - The password is created through Better Auth's server API (`signUpEmail`), so it is
    hashed with Better Auth's own algorithm and **login verifies correctly**. Do not
    swap this for a manual bcrypt insert.
  - The plan is intentionally left on **FREE** — buy PREMIUM + the AI add-on through
    the real Stripe checkout so a genuine subscription drives entitlement.
  - Account details are hardcoded at the top of the file.
- **`delete-gift-trial-org.ts`** — cancels the org's Stripe subscription + customer and
  deletes every DB row tied to the org, in foreign-key-safe order.

## Usage

From `apps/hono-api`:

```bash
# 1. Create the gift account
bun run gift-trial:create
# (equivalently) infisical run --path=/hono-api -- tsx scripts/gift-trial/create-gift-trial-org.ts
```

The create script prints a summary block with `ORG_ID`, `USER_ID`, and `ADMIN_EMAIL`.

2. Log in at the admin app with the printed credentials and **purchase PREMIUM + the
   AI add-on** via Stripe checkout. The webhook flips `organization.plan` to `PREMIUM`
   and `organization.aiAddonActive` to `true`.

3. When the gift is over, paste the three printed values into the constants at the top
   of `delete-gift-trial-org.ts`, then:

```bash
bun run gift-trial:delete -- --confirm
# (equivalently) infisical run --path=/hono-api -- tsx scripts/gift-trial/delete-gift-trial-org.ts --confirm
```

The delete script refuses to run without `--confirm` and without `ORG_ID`/`USER_ID` set.

## Deletion order (why)

Some tables have no `ON DELETE CASCADE` to `organization`, and
`applicationAiContext.completedBy -> user` is `ON DELETE RESTRICT`. So the order is:

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
