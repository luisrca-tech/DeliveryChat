# AI Interview — Test Briefs

Sample business descriptions for exercising the AI interview + summarization
feature end-to-end. Each brief targets a specific behavior of the interviewer
(question depth, auto-finish trigger, coaching of vague input) so that runs
can be judged with concrete pass/fail criteria instead of by feel.

Paste a brief into the interview as if you were the founder describing the
product. Compare the resulting questions and summary against the
**Expected behavior** block at the end of each section.

The DeliveryChat brief (the canonical baseline) is covered separately; the
three briefs below are designed to cover different stress dimensions:

| Brief      | Fidelity | Language | Stress dimension                              |
| ---------- | -------- | -------- | --------------------------------------------- |
| Hortifruti | High     | English  | Trigger the 15-question cap + auto-finish     |
| FlagPilot  | Medium   | English  | SaaS-shape consistency vs the DeliveryChat run |
| ZapZap     | Low      | pt-BR    | Coach a vague user toward enough context      |

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

## 3. ZapZap — Low fidelity / informal (pt-BR)

### Pitch

> "tipo, é um app pra eu organizar minhas coisas sabe? tipo umas listas e
> umas notas. minha namorada também vai usar. acho que pode ter umas
> notificações também. nome provisório é ZapZap mas talvez eu mude."

### Key facts (intentionally vague)

- "Tá no começo, ainda nem tem nada feito direito"
- "Vai ser de graça acho, ou sei lá talvez eu cobre depois"
- "Acho que qualquer pessoa pode usar"
- "Quero que seja bonito e rápido"

### Expected behavior

- Interview should **not auto-finish** and should **not throw a hard error**
- The AI should ask clarifying questions **in Portuguese** that gently push
  toward concrete answers:
  - Who specifically is the user?
  - What problem does ZapZap solve that Notion / Google Keep / Todoist
    don't already solve?
  - What does success look like?
- Pass criteria: after 4–6 turns of coaching, the user has enough scaffolding
  to either (a) provide real answers, or (b) realize they don't have a
  product idea yet
- If a summary is produced, it should honestly reflect the thin context
  rather than fabricate facts

---

## Running the briefs

1. Create a fresh tenant (or reuse a sandbox tenant) per brief — don't reuse
   context across runs, it pollutes the interviewer's prior.
2. Paste the brief verbatim as the first user message.
3. Answer follow-up questions in the same tone as the brief
   (formal for Hortifruti/FlagPilot, informal pt-BR for ZapZap).
4. After the interview finishes (or auto-finishes), compare the summary
   against the **Expected behavior** checklist for that brief.
5. Log any divergence — missed facts, wrong tone, hard error on ZapZap, or
   premature finish on Hortifruti — as a follow-up issue.
