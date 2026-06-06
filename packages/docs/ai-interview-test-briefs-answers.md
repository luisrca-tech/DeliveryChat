# AI Interview — Answer scripts (manual QA)

Copy-paste replies for the three briefs in [`ai-interview-test-briefs.md`](./ai-interview-test-briefs.md).
Use **one new application per brief**.

## How the interview actually works

1. Click **Begin interview** → the AI asks turn 0 (opening question).
2. Your **first paste** is the answer to that question (usually business description), not text on the intro screen.
3. Read the **eyebrow** on each question (`Business Description`, `Preferred Tone`, …). Reply only to that topic.
4. The engine tracks **6 core topics** (not “8 key facts” from the brief):

| Eyebrow (approx.) | Core topic key | Use answer block from tables below |
| ----------------- | -------------- | ---------------------------------- |
| Business Description | `business_description` | Pitch |
| Target Audience | `target_audience` | Users |
| Products Services | `products_services` | Features + pricing |
| Preferred Tone | `preferred_tone` | Tone (invented — not in brief) |
| Common Support Scenarios | `common_support_scenarios` | Pains + ops |
| Prohibited Topics | `prohibited_topics` | Guardrails (invented) |

5. **`suggest_finish`** (turns ~8–12, all topics covered): the UI offers **Finish interview**.  
   - **Hortifruti:** do **not** click Finish yet — keep sending messages (see [After suggest_finish](#after-suggest_finish)) until you hit **turn 15** and **auto-finish**.  
   - **FlagPilot:** click **Finish** after `suggest_finish` (normal path).  
   - **ZapZap:** stay vague early; only finish manually once coached or when `suggest_finish` appears with thin context.

If you see **Staying on track · {Topic}**, you answered the wrong topic — resend that topic’s block only.

---

## Global: after `suggest_finish`

When the assistant says all core topics are covered and invites you to finish:

| Brief | Action |
| ----- | ------ |
| **Hortifruti** | Ignore **Finish**. Send the **extension messages** below, one per turn, until **Turn 15 of 15** and the interview **auto-completes**. |
| **FlagPilot** | Click **Finish interview** (or send at most **one** short extra line, then Finish). Do **not** run to turn 15. |
| **Verbose Founder** | Ignore **Finish**. Send the **Discovery-phase script** (see [appendix](#verbose-founder--discovery-phase-script)) one tagged message per turn until the interview **auto-completes** at turn 15. |

### Hortifruti — extension turns (paste one per turn after `suggest_finish`)

Use these in order to burn turns toward the cap without going off-topic:

```text
Extra context: we're 28 people — 8 eng, 6 ops/logistics, 6 growth, 4 farmer success, 4 G&A. HQ in Vila Olímpia, SP.
```

```text
We raised a R$ 4M seed 10 months ago; runway ~14 months at current burn. Monthly subscription churn ~4.2%; à la carte repeat rate ~38%.
```

```text
Support volume: ~420 tickets/week — top tags are late delivery (32%), missing/wrong item (24%), subscription skip/pause (18%), farmer payout timing (12%).
```

```text
We're testing WhatsApp status updates for ETA; not public yet. B2B pilot with 6 restaurants in Moema, separate SKU catalog.
```

```text
Brand: never promise delivery outside the 2h window; don't give medical or "organic cures health" claims; don't disparage supermarket produce.
```

```text
6-month bets unchanged: R$ 1.2M MRR, Zona Oeste, B2B tier — hiring 2 ops leads and 1 SDR for restaurant outbound.
```

If you hit `suggest_finish` before turn 8, answer the next checklist question normally first, then use extensions.

---

## 1. Hortifruti — High fidelity (EN)

**Goal:** All 6 topics answered cleanly → `suggest_finish` → **keep talking** → **turn 15 auto-finish**.  
**Tone:** Professional, concise English.

### First message (reply to opening question)

```text
Hortifruti is a same-day produce delivery marketplace connecting families in
São Paulo's Zona Sul to small organic farms within an 80km radius. Customers
order weekly produce boxes or à la carte items through the app; farmers
receive consolidated orders every morning and drop off at one of 4 regional
hubs, where our last-mile fleet handles 2-hour delivery windows.
```

### Copy-paste by topic (use whenever the eyebrow matches)

**Target audience**

```text
Two-sided marketplace: (1) end customers — urban families, 28–48, household
income R$ 8k+, mostly Zona Sul; (2) supply — small organic farmers, 15–50
hectares, 47 onboarded today. We're 14 months in, ~3,200 active subscribers,
R$ 480k MRR.
```

**Products / services**

```text
Subscription boxes (R$ 89 / R$ 149 / R$ 219 per week), à la carte marketplace
with 18% take rate, subscription box builder, farmer dashboard (orders +
payouts), customer routes/ETAs, and a "rescue produce" tier for cosmetic
seconds. Mobile app (iOS/Android) plus ops admin on the web.
```

**Preferred tone** *(not in brief — required)*

```text
Warm and local with families — we're a food brand, not a bank. Clear and
empathetic when delivery is late or a box is wrong; concise in chat. OK to
use Brazilian Portuguese with end customers; English is fine for internal ops.
```

**Common support scenarios**

```text
Typical issues: late or missed 2h window, wrong/missing items in a box,
subscription pause/skip/change, refund for damaged produce, farmer payout
delays, and "where is my order" ETA questions. Ops pain: farmer onboarding
is manual (~3h call + paperwork). Growth pain: CAC doubled in 6 months as
Meta ads saturate; LTV is still strong.
```

**Prohibited topics** *(not in brief — required)*

```text
Don't make medical or "superfood cures" claims; don't guarantee delivery
outside published windows; no legal/tax/dietary advice; don't trash
competitors or supermarkets; don't share farmer payout contracts or internal
margins with customers.
```

### Fast path — if questions follow the usual order

| Step | Eyebrow (expected) | Paste |
| ---- | -------------------- | ----- |
| 1 | Business Description | [First message](#first-message-reply-to-opening-question) |
| 2 | Target Audience | Target audience block |
| 3 | Products Services | Products / services block |
| 4 | Preferred Tone | Preferred tone block |
| 5 | Common Support Scenarios | Common support scenarios block |
| 6 | Prohibited Topics | Prohibited topics block |
| 7+ | `suggest_finish` then extensions | [Extension turns](#hortifruti--extension-turns-paste-one-per-turn-after-suggest_finish) |

### Pass checklist (summary)

- Two-sided marketplace, hybrid revenue, traceability moat, CAC + manual onboarding pains, Zona Oeste + B2B goals.
- **Turn 15** forced completion without you clicking Finish early.

---

## 2. FlagPilot — Medium fidelity (EN)

**Goal:** ~8–11 turns, `suggest_finish`, then **Finish interview** (no cap marathon).  
**Tone:** Clear SaaS English, similar to DeliveryChat baseline.

### First message

```text
FlagPilot is a feature-flag and gradual-rollout service built for solo
founders and 2–5 person teams who find LaunchDarkly overkill and expensive.
```

### Copy-paste by topic

**Target audience**

```text
Indie hackers and small SaaS teams with 1–5 engineers — people who want
feature flags without enterprise sales cycles. Public beta, 6 months in,
~140 paying customers.
```

**Products / services**

```text
Flag CRUD, percentage rollouts, user-segment targeting, SDKs for
Node/Python/Go. Pricing: free up to 3 flags and 10k MAU; Pro $19/mo unlimited;
Team $49/mo adds audit log.
```

**Preferred tone**

```text
Direct and technical but friendly — assume the reader knows what a flag is.
Short answers, no marketing fluff. OK to say "I don't know" and link docs.
Avoid enterprise buzzwords.
```

**Common support scenarios**

```text
SDK integration mistakes, flag not evaluating as expected, rollout stuck at
0%, billing/plan limits, and "how do I target beta users by email hash".
Docs-first; escalate to email support on Team plan.
```

**Prohibited topics**

```text
Don't promise LaunchDarkly feature parity; don't give legal/compliance
guarantees; don't share other customers' flag configs; no custom SLAs on
Pro without sales.
```

**Differentiator / roadmap** *(use if asked in business or products follow-up)*

```text
Differentiator: 5-minute setup, no SDR calls, transparent pricing. Next
quarter: scheduled rollouts and Slack notifications.
```

### Fast path

| Step | Paste |
| ---- | ----- |
| 1 | First message |
| 2 | Target audience |
| 3 | Products / services (include differentiator line if room) |
| 4 | Preferred tone |
| 5 | Common support scenarios |
| 6 | Prohibited topics |
| 7 | On `suggest_finish` → **Finish interview** |

Optional single extra line before Finish:

```text
That's everything for v1 — scheduled rollouts and Slack are the only big
items on the roadmap this quarter.
```

### Pass checklist (summary)

- SMB ICP, self-serve vs enterprise, flags/rollouts core, roadmap (scheduled rollouts, Slack).
- **No** turn-15 auto-finish.

---

## 3. Verbose Founder — Discovery phase script

**Goal:** Replay Hortifruti turns 1–7, then send tagged Discovery-phase extras
covering every classification path until **turn 15 auto-finish**.  
**Tone:** Same as Hortifruti — professional, concise English.

### Turns 1–7: reuse Hortifruti blocks

Paste, in order, the Hortifruti blocks above:

1. [Hortifruti first message](#first-message-reply-to-opening-question)
2. Target audience
3. Products / services
4. Preferred tone
5. Common support scenarios
6. Prohibited topics

Stop when the assistant emits `suggest_finish` (typically turn 7 or 8). Do
**not** click Finish.

### Discovery-phase script (one per turn after `suggest_finish`)

Send these in order. The bracketed tag is the **expected**
`extraContextRelevance` on the persisted log entry — do **not** type the
tag into the chat; paste only the message body.

**Turn 8 — `[relevant]` (new prohibited topic)**

```text
One more prohibited topic: we cannot give nutritional or weight-loss advice
tied to specific produce items. Treat that as off-limits.
```

**Turn 9 — `[irrelevant]` (operational facts: funding, runway, churn)**

```text
We raised a R$ 4M seed 10 months ago; runway ~14 months at current burn.
Monthly subscription churn ~4.2%.
```

**Turn 10 — `[relevant]` (new audience segment)**

```text
New audience segment: restaurant buyers (chefs, head cooks) in the Moema
B2B pilot. They expect invoice-style receipts and bulk-order CSV exports.
```

**Turn 11 — `[irrelevant]` (headcount + HQ)**

```text
Team breakdown: 28 people total — 8 eng, 6 ops/logistics, 6 growth,
4 farmer success, 4 G&A. HQ in Vila Olímpia, SP.
```

**Turn 12 — `[duplicate]` (paraphrase of turn 8's prohibited-topic addition)**

```text
Reminder for the prohibited list: no nutritional or weight-loss advice
tied to particular fruits or vegetables. Keep that explicitly out of scope.
```

**Turn 13 — `[relevant]` (new tone constraint for late deliveries)**

```text
Tone constraint: when a delivery is late, lead with empathy and a concrete
next step (re-delivery window, refund, credit) before anything else. Never
start with policy language.
```

**Turn 14 — `[duplicate]` (paraphrase of turn 10's restaurant-buyer segment)**

```text
On the audience side, don't forget the new restaurant-buyer segment in the
Moema pilot — invoice receipts and CSV exports matter to them.
```

Turn 15 is the engine's forced-completion turn — no paste needed; the
interview auto-finishes.

### Pass checklist (summary)

- No turn 8–14 assistant message is byte-equal to `SUGGEST_FINISH_CLOSING_MESSAGE`.
- No raw `**` asterisks in any Discovery-phase assistant prose.
- No assistant message names a UI element ("Finish interview", "click Finish").
- Persisted `extraContextRelevance` on each turn matches the tag above.
- `[relevant]` turns (8, 10, 13) produce exactly one follow-up question; `[irrelevant]` and `[duplicate]` turns do not.
- Final `contextSummary` captures the new prohibited topic, restaurant-buyer segment, and late-delivery tone constraint; it does **not** mention funding, runway, churn, headcount, or HQ.
- Run reaches **turn 15** under the new prompt path and auto-completes.

---

## Quick comparison

| | Hortifruti | FlagPilot | Verbose Founder |
| --- | --- | --- | --- |
| First reply | Full pitch | Full pitch | Full pitch (same as Hortifruti) |
| Answer style | On-topic EN blocks | On-topic EN blocks | Hortifruti blocks turns 1–7, tagged extras turns 8–14 |
| At `suggest_finish` | Keep sending extensions | **Finish** | Keep sending Discovery-phase extras |
| Turn 15 auto-finish | **Yes — required** | **No** | **Yes — required** |
| Classification asserted? | No | No | **Yes** (`relevant` / `irrelevant` / `duplicate`) |

---

## Related docs

- Briefs + expected outcomes: [`ai-interview-test-briefs.md`](./ai-interview-test-briefs.md)
- Product flow: [`ai-interview.md`](./ai-interview.md)
- Engine (6 topics, cap, `suggest_finish`): `apps/hono-api/src/features/ai/docs/interview-engine.md`
