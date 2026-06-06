# AI Interview — Test Briefs

Sample business descriptions for exercising the AI interview + summarization
feature end-to-end. Each brief targets a specific behavior of the interviewer
(question depth, auto-finish trigger, coaching of vague input) so that runs
can be judged with concrete pass/fail criteria instead of by feel.

Paste a brief into the interview as if you were the founder describing the
product. Compare the resulting questions and summary against the
**Expected behavior** block at the end of each section.

**Turn-by-turn answer scripts** (mapped to the 6 core topics, including what
to do after `suggest_finish`): [`ai-interview-test-briefs-answers.md`](./ai-interview-test-briefs-answers.md).

**Chat-simulation brief** (post-interview manual role-play of visitor
conversations against each brief's `contextSummary`):
[`ai-interview-chat-simulation-brief.md`](./ai-interview-chat-simulation-brief.md).

The DeliveryChat brief (the canonical baseline) is covered separately; the
three briefs below are designed to cover different stress dimensions:

| Brief           | Fidelity | Language | Stress dimension                                          |
| --------------- | -------- | -------- | --------------------------------------------------------- |
| Hortifruti      | High     | English  | Trigger the 15-question cap + auto-finish                 |
| FlagPilot       | Medium   | English  | SaaS-shape consistency vs the DeliveryChat run            |
| Verbose Founder | High     | English  | Discovery-phase classify-then-act (relevant / irrelevant / duplicate) |

---

## 1. Hortifruti — High fidelity (EN)

### Pitch

Hortifruti is a same-day produce delivery marketplace connecting families in
São Paulo's Zona Sul to small organic farms within an 80km radius. Customers
order weekly produce boxes or à la carte items through the app; farmers
receive consolidated orders every morning and drop off at one of 4 regional
hubs, where our last-mile fleet handles 2-hour delivery windows.

### Key facts

- **Stage:** 14 months post-launch, ~3,200 active subscribers, R$ 480k MRR
- **Users:** Two sides — (1) end customers (urban families, 28–48yo,
  R$ 8k+ household income), (2) small farmers (15–50 hectare operations,
  currently 47 onboarded)
- **Pricing:** Subscription boxes (R$ 89 / R$ 149 / R$ 219 weekly) +
  18% marketplace fee on à la carte items
- **Core features:** Subscription box builder, à la carte marketplace,
  farmer dashboard (orders + payout), customer routes/ETAs, "rescue produce"
  discounted tier for cosmetic seconds
- **Tech:** React Native app (iOS + Android), web admin for ops, internal
  Rails monolith, Stripe Connect for farmer payouts
- **Differentiator:** Traceability — every item links to the farmer's
  profile, harvest date, and a short video; only player in SP doing this
  end-to-end
- **Current pain:** Farmer onboarding is manual (3h call + paperwork);
  LTV is strong but CAC has doubled in 6 months as Meta ads saturate
- **6-month goal:** Hit R$ 1.2M MRR, expand to Zona Oeste, launch B2B tier
  for restaurants

### Expected behavior

- Interview should hit the **15-question cap** and trigger **auto-finish**
- Summary must capture:
  1. Two-sided marketplace nature
  2. Subscription + à la carte hybrid revenue
  3. Traceability as the moat
  4. CAC saturation and manual farmer onboarding as top pains
  5. Geographic expansion + B2B as the next bets

If the interview finishes before question 15, expand the brief with 2–3 more
facts (team size, funding, churn rate) and re-run.

---

## 2. FlagPilot — Medium fidelity (EN)

### Pitch

FlagPilot is a feature-flag and gradual-rollout service built for solo
founders and 2–5 person teams who find LaunchDarkly overkill and expensive.

### Key facts

- **Stage:** Public beta, 6 months in, ~140 paying customers
- **Users:** Indie hackers and small SaaS teams (1–5 engineers)
- **Pricing:** Free up to 3 flags / 10k MAU; Pro $19/mo unlimited;
  Team $49/mo with audit log
- **Core features:** Flag CRUD, percentage rollouts, user-segment targeting,
  SDKs for Node/Python/Go
- **Differentiator:** 5-minute setup, no SDR calls, transparent pricing
- **Goal next quarter:** Add scheduled rollouts + Slack notifications

### Expected behavior

- ~8–11 questions, **no auto-finish** (manual finish)
- Summary must capture:
  1. SMB / indie-hacker ICP
  2. Self-serve pricing positioned against enterprise incumbents
  3. Flag + rollout as the core scope
  4. Near-term roadmap (scheduled rollouts, Slack)

This brief should produce an interview shape similar to the DeliveryChat
baseline — use it to spot regressions in the SaaS question path.

---

## 3. Verbose Founder — High fidelity (EN)

A near-replay of the original Hortifruti loop bug. Turns 1–7 mirror the
Hortifruti run; turns 8–~14 send tagged extra-context messages that exercise
every Discovery-phase classification path (`relevant`, `irrelevant`,
`duplicate`, including at least one paraphrased duplicate). Each turn's tag
is the expected `extraContextRelevance` value persisted on the interview
log entry.

### Pitch (turns 1–7)

Identical to the Hortifruti pitch above. Reuse the Hortifruti **first
message** and the **per-topic blocks** in the answers companion for turns
1–7 so that all six core topics are covered before turn 8.

### Discovery-phase script (turns 8–~14)

Each line is one admin message, sent one per turn after `suggest_finish`.
The bracketed tag is the expected classification — not part of the message
content.

```text
[relevant] One more prohibited topic: we cannot give nutritional or weight-loss advice tied to specific produce items. Treat that as off-limits.
```

```text
[irrelevant] We raised a R$ 4M seed 10 months ago; runway ~14 months at current burn. Monthly subscription churn ~4.2%.
```

```text
[relevant] New audience segment: restaurant buyers (chefs, head cooks) in the Moema B2B pilot. They expect invoice-style receipts and bulk-order CSV exports.
```

```text
[irrelevant] Team breakdown: 28 people total — 8 eng, 6 ops/logistics, 6 growth, 4 farmer success, 4 G&A. HQ in Vila Olímpia, SP.
```

```text
[duplicate] Reminder for the prohibited list: no nutritional or weight-loss advice tied to particular fruits or vegetables. Keep that explicitly out of scope.
```

```text
[relevant] Tone constraint: when a delivery is late, lead with empathy and a concrete next step (re-delivery window, refund, credit) before anything else. Never start with policy language.
```

```text
[duplicate] On the audience side, don't forget the new restaurant-buyer segment in the Moema pilot — invoice receipts and CSV exports matter to them.
```

### Expected behavior (per-turn assertions)

For every Discovery turn (8 through last):

1. The assistant message is **not** byte-equal to `SUGGEST_FINISH_CLOSING_MESSAGE` ("All core topics are covered…").
2. The assistant message contains **no raw markdown asterisks** (`**`) in prose.
3. The assistant message does **not** name a UI element by label (no "Finish interview", no "click Finish").
4. The persisted log entry's `extraContextRelevance` matches the bracketed tag for that turn.
5. Only `[relevant]` turns produce a single follow-up question (`followUpQuestion: true`); `[irrelevant]` and `[duplicate]` turns produce acknowledgement only (`followUpQuestion: false` or absent).
6. At least one `[duplicate]` turn in the script is a paraphrase (not an exact copy) of an earlier message, exercising non-exact-match detection.

For the run as a whole:

7. The interview completes within the **fifteen-turn cap** (forced completion at turn 15 still works under the new prompt path).
8. The final `contextSummary` captures **every** `[relevant]` extra (new prohibited topic, restaurant-buyer audience segment, late-delivery tone constraint) and **none** of the `[irrelevant]` ones (no funding, runway, headcount, churn).
9. `canFinish` remains `true` throughout the Discovery phase.

---

## Running the briefs

1. Create a fresh application per brief — don't reuse context across runs.
2. Open **AI interview** → **Begin interview** → paste the **first answer**
   from [`ai-interview-test-briefs-answers.md`](./ai-interview-test-briefs-answers.md)
   (not the intro screen).
3. For each follow-up, match the **eyebrow** to the answer block in that doc.
4. At `suggest_finish`: **Hortifruti** and **Verbose Founder** keep going to
   turn 15 (extension / Discovery turns); **FlagPilot** finishes manually
   (see answers doc).
5. Compare the summary against **Expected behavior** above.
6. Log divergences as follow-up issues.
