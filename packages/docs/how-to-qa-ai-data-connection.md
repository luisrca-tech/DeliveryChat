# How-to-QA — AI Data Connection & Assistant Add-on

Manual end-to-end verification checklist for the autonomous AI assistant, data tools, escalation, and AI add-on billing shipped on `feature/ai-data-connection`. Check every box as you go; a section passes only when all its boxes are ticked.

> Authored against commit `4fee899` on `feature/ai-data-connection` (base: `development`). Microcopy asserted "verbatim" matches the source files as of delivery. Later commits on this branch (`fdf9a6a` public plans endpoint, `d8c71a6` Application Details page) are **not covered** — they are being developed in a parallel session and need their own QA pass.

## Locked design recap (the rules being verified)

* The add-on is modeled as a **second subscription item** on the existing Stripe subscription — never a second subscription. Eligible plans: `PREMIUM`, `ENTERPRISE` only.
* `aiAddonActive` / `aiAddonSubscriptionItemId` are derived **exclusively from Stripe webhooks** — `POST /billing/ai-addon` and `DELETE /billing/ai-addon` only mutate Stripe and return `status: "pending"`.
* The AI answers autonomously only when **all four** hold: org plan ∈ {PREMIUM, ENTERPRISE} **and** `aiAddonActive` **and** application `aiEnabled` **and** application `aiAutoRespond`.
* Escalation policy: "when in doubt, escalate — never fabricate". Kinds: `knowledge_gap`, `human_requested`, `turn_failed`, `quota_exhausted`. Escalation flips the conversation to `handledBy="human"`, `status="pending"`, back into the operator queue.
* Data-source secrets (HTTP headers, SQL connection string) are **write-only**: AES-256-GCM encrypted at rest, never returned by the API (only `hasHeaders` / `headerNames` / `hasConnectionString`).
* Data tools are **read-only by construction**: HTTP = GET-only + exact-host allowlist + SSRF/private-IP guard + no redirects; SQL = single-SELECT validation + positional binds + `LIMIT 50` default + 5s statement timeout.
* **Test-before-enable**: a tool cannot be enabled until a live test succeeded; any edit resets `enabled=false` and `lastTestedAt=null`.
* Data tools are **hard-deleted** (config data); conversations/messages keep their existing soft-delete behavior.

## Preconditions / setup

⚠️ **`bun run db:seed` seeds nothing for any AI feature** — no data source, no tool, no entitlement flags, no escalated conversation. Everything below is manual setup.

- [ ] Migrations `0034`–`0036` applied (new tables `delivery_chat_application_data_source`, `delivery_chat_application_data_tool`; enums `data_source_kind`, `conversation_handled_by`, `message_author_type`; `ai_action` values `autonomous_reply`, `handoff_summary`).
- [ ] `SECRETS_ENCRYPTION_KEY` set in Infisical (`/hono-api`) to a base64 32-byte key (`openssl rand -base64 32`). The API refuses to boot without it. *(Flag: it is **not** in `turbo.json`'s env allowlist — CI builds relying on turbo's passthrough won't forward it.)*
- [ ] `STRIPE_AI_ADDON_PRICE_KEY` set to a Stripe test-mode Price that has: `lookup_key = "ai_addon_monthly"`, BRL `currency_options` of R$ 120,00 (and USD US$ 24 if testing USD).
- [ ] `bun run stripe:listen` running so webhooks reach the API.
- [ ] An org on **PREMIUM** (or ENTERPRISE) with an **active** Stripe subscription; a second org on **BASIC** or **FREE** (for ineligibility checks).
- [ ] Accounts: one `super_admin`, one `admin`, one `operator` on the tenant.
- [ ] A page embedding the widget (`DeliveryChat.init({ appId })`) for the visitor side; a DB terminal for spot-checks.
- [ ] A reachable public JSON API for HTTP-tool tests (e.g. your own test API) and/or a Postgres DB with a **read-only** role for SQL-tool tests.

## 1. AI add-on — billing card, preview dialog, purchase, cancel

- [ ] As `super_admin` on the PREMIUM org, open **Settings → Billing**.
    - [ ] Expected: card **"AI Assistant add-on"** with description "R$ 120/month (US$ 24 for USD-billed accounts) — autonomous AI answers in the widget, connects to your data, human escalation included." and three bullets (autonomous answers / connects to data sources / automatic escalation).
    - [ ] Expected: button **"Enable add-on"**.
- [ ] Click **"Enable add-on"**.
    - [ ] Expected: dialog **"Enable AI Assistant add-on"** — "Review the charges before enabling the add-on." Shows **"Loading pricing…"** then a sentence with a prorated amount, then "**R$ 120.00/month** starting <date>" (amounts are server-computed from `GET /billing/ai-addon/preview` → `{ currency, prorationAmount, recurringAmount, nextBillingDate }`).
    - [ ] Expected: links/buttons **"Manage payment method"**, **"Cancel"**, **"Confirm & enable"**.
- [ ] Click **"Confirm & enable"**.
    - [ ] Expected: toast **"AI add-on purchase started"** / "It will activate once payment is confirmed." (API returned 200 `status: "pending"` — the card does **not** flip to Active yet).
- [ ] Wait for the `customer.subscription.updated` webhook.
    - [ ] Expected: billing card now shows green badge **"Active"** and button **"Cancel add-on"**; DB: `delivery_chat_organization.ai_addon_active = true`, `ai_addon_subscription_item_id` set.
    - [ ] Expected: activation email to the billing email, subject exactly **"AI Assistant add-on is now active"** (sent only on the false→true transition).
- [ ] Error paths (call `POST /billing/ai-addon` as super_admin):
    - [ ] Org without a subscription → 400 `no_active_subscription`; UI toast **"Unable to enable the AI add-on"** / "An active subscription is required before adding the AI add-on."
    - [ ] BASIC-plan org → 403 `plan_not_eligible`; UI copy "The AI add-on is only available on the PREMIUM and ENTERPRISE plans." (card itself shows "Available on Premium and Enterprise plans.").
    - [ ] Already active → 409 `ai_addon_already_active`.
- [ ] As `admin` (not super_admin) on the PREMIUM org, open Billing.
    - [ ] Expected: no enable/cancel button — text "Contact your Admin to enable this add-on." (or "…to manage this add-on." when active). Direct API call → 403 "Insufficient role".
- [ ] Click **"Cancel add-on"** (super_admin, active add-on).
    - [ ] Expected: confirm dialog **"Cancel AI add-on"** — "Are you sure you want to cancel the AI Assistant add-on? The AI will stop answering visitors once the cancellation is confirmed." Buttons **"Cancel add-on"** / **"Keep add-on"**.
    - [ ] Expected after confirm: toast **"AI add-on cancellation started"** / "It will be removed once confirmed."; after webhook: badge gone, `ai_addon_active = false`.
- [ ] Downgrade revocation: with the add-on active, downgrade the org to BASIC in Stripe.
    - [ ] Expected after webhook: `ai_addon_active = false`, `ai_addon_subscription_item_id = null`, and the add-on item is removed from the Stripe subscription (deferred `subscriptionItems.del` with prorations).

## 2. Data tools — gating, data source, CRUD, test-before-enable

- [ ] With the add-on **inactive**, open an application's row menu in **Applications** → click **"Data tools"**.
    - [ ] Expected: locked card **"Data tools require the AI Assistant add-on"** with body mentioning **Settings → Billing** and Premium/Enterprise. API: any data-tools endpoint → 403 `ai_addon_not_active` "The AI add-on is not active for your organization."
- [ ] As `operator` (add-on active): open the page / call the API.
    - [ ] Expected: page renders nothing (role gate `admin`+); API → 403 "Insufficient role". Signed-out API call → 401.
- [ ] As `admin` with the add-on active: page shows H1 **"Data tools"**, card **"Data source"** with Kind select (**"HTTP API"** / **"SQL database"**).
- [ ] HTTP source: enter Base URL `https://api.example.com` with a mismatched Allowed host → save is rejected by the API with validation message **"allowedHost must equal the host of baseUrl"**; the UI offers a **"Use api.example.com"** suggestion button, and the help text mentions "this is the SSRF guardrail".
    - [ ] Add a header (placeholders **"Header name"** / **"Header value"**, value field is a password input) → **"Save data source"** → toast **"Data source saved"**.
    - [ ] Re-open: header value shows **"•••• (saved)"** — the actual value is never returned (API response only has `hasHeaders`/`headerNames`). DB: `config.encryptedHeaders` values start with `v1:`.
- [ ] SQL source: leave connection string blank on first save → client-side pre-flight error **"Connection string is required when creating a SQL data source"** (the API's own 400, if reached directly, says **"connectionString is required when creating a SQL data source"** — camelCase; both exist by design). Save with `postgres://…` → placeholder becomes **"•••• (saved — leave blank to keep current)"**; DB stores `encryptedConnectionString` prefixed `v1:`.
- [ ] Tools list: with no source, **"New tool"** is disabled with helper "Configure a data source above before adding tools."; empty state "No tools yet. Add one to give the AI a new capability."
- [ ] Create a tool (dialog **"New data tool"**):
    - [ ] Name `123bad` → blocked (help: "Must start with a letter; letters, digits, and underscores only."). Description of 9 chars → blocked ("At least 10 characters." / API "description must be at least 10 characters").
    - [ ] Backing mismatch (SQL tool on HTTP source) → 400 `backingType "sql" does not match the data source kind "http"`.
    - [ ] SQL query `DELETE FROM x` → 400 "Query must start with SELECT"; `SELECT 1; SELECT 2` → "Only a single statement is allowed"; `SELECT * INTO t FROM x` → keyword rejection.
    - [ ] Valid tool saves → toast **"Tool created"** (201). Duplicate name → 409 "A tool with this name already exists for this application".
- [ ] Test-before-enable:
    - [ ] Before saving: test block says **"Save the tool first to run a test."**; Enabled switch tooltip **"Run a successful test before enabling"**. Direct API `POST …/enable {enabled:true}` → 400 "tool must pass a test request before enabling".
    - [ ] **"Send test request"** with sample params → success: green JSON block, `last_tested_at` set, list shows "Last tested" relative time (was **"Never"**).
    - [ ] Failing test (e.g. unreachable host) → **HTTP 200** with red block `[<kind>] <error>` — a failed test is a result, not an HTTP error.
    - [ ] Enable the switch → status badge **"Enabled"**. Edit the tool (any field) and save → switch back to **"Disabled"**, "Last tested" back to **"Never"** (edit resets both).
- [ ] Delete a tool → dialog **"Delete this tool?"** / `"<name>" will no longer be available to the AI. This cannot be undone.` → toast **"Tool deleted"**; DB row is **gone** (hard delete).
- [ ] Executor guardrails (HTTP tool test): URL resolving to a private IP (e.g. base URL pointing at `127.0.0.1` or an internal host) → test fails (SSRF guard); a redirecting endpoint → "Redirect responses are not allowed"; non-JSON response → "Response was not valid JSON".

## 3. Autonomous AI turn (widget)

Setup: add-on active, application has `aiEnabled=true` and `aiAutoRespond=true` (no admin UI on the covered commits — set via DB/API), at least one enabled tool.

- [ ] Open the widget fresh (new visitor).
    - [ ] Expected: opening disclosure system message: `Hi! I'm <header title>'s AI Assistant. I can help you — or connect you to a person anytime.` *(Flag: if the app has no header title the copy degrades to "…I'm our's AI Assistant…" — known grammar bug.)*
- [ ] Send a question answerable via a data tool.
    - [ ] Expected: typing indicator **"AI Assistant is typing..."**, then an AI reply rendered with a robot avatar, indigo-bordered bubble, and label **"AI Assistant"** (`author_type='ai'` in `delivery_chat_messages`).
    - [ ] Expected: conversation stays out of the operator queue (`handled_by='ai'`, `status` unchanged, unassigned).
- [ ] Admin chat view of the same conversation:
    - [ ] Expected: **"AI"** badge (title "Handled by AI") in the header and list item; AI messages labeled **"AI Assistant"** with indigo styling.
- [ ] Entitlement kill-switch: set `ai_auto_respond=false` (or cancel the add-on) and send another visitor message.
    - [ ] Expected: no AI reply; conversation is created/continued as a normal human-queue conversation.

## 4. Escalation — all triggers + handoff summary

- [ ] Visitor clicks the header icon button (aria-label **"Talk to a human"**) on an AI conversation.
    - [ ] Expected: system message **"Sure — connecting you with a team member now. You're in the queue; someone will join shortly."**; the button becomes disabled; DB: `handled_by='human'`, `status='pending'`, `escalated_at` set, `escalation_reason='human_requested'`.
    - [ ] Expected: conversation appears in the operator queue in real time (staff WS event `conversation:escalated`); list item shows **"Escalated"** pill.
- [ ] Type "I want to talk to a human" as the visitor message (deterministic pre-LLM match).
    - [ ] Expected: same escalation without any AI answer attempt.
- [ ] Knowledge-gap: ask something the AI cannot answer from its tools.
    - [ ] Expected: system message **"I wasn't able to fully answer that, so I'm connecting you with someone from our team. You're in the queue — an operator will be with you shortly."** (same string for `turn_failed` and `quota_exhausted`); `escalation_reason` is the model's reason (or `no_answer`), ≤ 500 chars.
- [ ] Turn-failure: break the provider (e.g. invalid Groq key) and send a message → same non-human-requested escalation copy, `escalation_reason='turn_failed'`. **The visitor is never left without a response.**
- [ ] Operator accepts the escalated conversation and replies.
    - [ ] Expected (widget): one-time system line **"You're now chatting with a team member."** exactly once, even across multiple operator messages; the handoff button stays disabled.
    - [ ] Expected (admin ParticipantPanel): collapsible **"AI handoff summary"** with a ≤ 6-sentence briefing and `Reason: <escalation reason>` (`conversations.handoff_summary` populated asynchronously — may take a few seconds; its failure must never block the escalation itself).
- [ ] Escalating a **closed** conversation via API → 409 "Conversation is closed". Widget escalate without `X-Visitor-Id` → 400 "X-Visitor-Id header required". Foreign conversation id → 404 "Conversation not found".

## 5. Authorization spot-check matrix

- [ ] Signed-out → `GET /billing/status` → **401** `unauthorized`.
- [ ] `operator` → `GET /applications/:id/data-tools` → **403** "Insufficient role"; `admin` → **200**.
- [ ] `admin` → `POST /billing/ai-addon` → **403** "Insufficient role"; `super_admin` → gated by §1 rules.
- [ ] Org with `past_due` status → data-tools **writes** → **402** payment_required; the two GET endpoints still work.
- [ ] Add-on inactive → all 8 data-tools endpoints → **403** `ai_addon_not_active` (checked after role, so use an `admin`).

## Sign-off

- [ ] Entitlement flags only ever changed by webhooks; purchase/cancel responses were `pending`.
- [ ] All four entitlement conditions required for an autonomous AI reply; removing any one stops the AI.
- [ ] Secrets never left the server after write; ciphertext `v1:`-prefixed in DB.
- [ ] No tool was enableable without a passed test; every edit re-locked it; deletes were hard.
- [ ] Every escalation path produced a visitor-facing system message, queue entry, `Escalated` badge, and (async) handoff summary.
- [ ] AI messages were visually distinguished (avatar + label) in both widget and admin.

### Known flags (from the code inventory, not blockers)

1. Disclosure grammar bug when the widget header title is empty ("I'm our's AI Assistant").
2. `SECRETS_ENCRYPTION_KEY` absent from `turbo.json` env allowlist.
3. Frontend `AI_ADDON_ERROR_MESSAGES` map and docs pricing copy are maintained separately from backend codes/Stripe price — verify they stay in sync.
4. No seed data for any AI feature — first-run setup is entirely manual (this doc's Preconditions).
