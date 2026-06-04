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
| **ZapZap** | Prefer **Finish** once `suggest_finish` appears with honest thin context. Optional: one more vague pt-BR line, then Finish. Never aim for turn 15. |

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

## 3. ZapZap — Low fidelity / informal (pt-BR)

**Goal:** Vague → coached clarifications **in Portuguese** → thin honest summary.  
**Opposite of Hortifruti:** do **not** spam extension turns; **do not** chase turn 15.

### First message (reply to opening — stay vague)

```text
tipo, é um app pra eu organizar minhas coisas sabe? tipo umas listas e
umas notas. minha namorada também vai usar. acho que pode ter umas
notificações também. nome provisório é ZapZap mas talvez eu mude.
```

### Phase A — deliberately unhelpful (turns 2–4)

Use these while the eyebrow still says **Target Audience**, **Products**, etc.  
Goal: trigger coaching / refocus, not checklist efficiency.

**If asked who the product is for:**

```text
sei lá, qualquer pessoa que quiser né? minha namorada e eu com certeza.
talvez amigos.
```

**If asked what problem it solves / vs Notion, Keep, Todoist:**

```text
é que os outros são complicados demais pra mim... eu só quero botar lista
rápido no celular. não sei explicar direito.
```

**If asked pricing / business model:**

```text
vai ser de graça acho, ou sei lá talvez eu cobre depois. nem pensei nisso
ainda.
```

**If asked tone:**

```text
quero que seja bonito e rápido. tipo moderno.
```

### Phase B — slightly less vague (turns 5–7, still informal)

After 4–6 coaching turns, soften **one topic at a time** (still pt-BR):

**Target audience (improved)**

```text
ok, pensando melhor: eu e minha namorada no dia a dia — listas de mercado,
coisas pra fazer em casa. não é pra empresa.
```

**Products (improved)**

```text
listas compartilhadas, notas rápidas, lembrete/notificação simples. nada de
planilha nem wiki. só mobile por enquanto, tá no começo, quase nada pronto.
```

**Support scenarios (honest thin)**

```text
se der bug ou perder nota eu falo comigo mesmo hoje rs. no futuro talvez um
email de suporte, mas não tem nada disso ainda.
```

**Prohibited / limits (honest thin)**

```text
não prometer que vai substituir Notion. não inventar recurso que não
existe. se não sei, falar que ainda não tem.
```

### Phase C — end the run

| When | Action |
| ---- | ------ |
| `suggest_finish` with thin context | Click **Finish interview** |
| Still stuck on same topic after 3+ redirects | Send Phase B block for **that** topic only |
| Interview feels complete but no Finish yet | Paste once: `acho que é isso por enquanto, ainda tô descobrindo o produto` → then **Finish** |

**Do not** use Hortifruti extension paragraphs. **Do not** aim for turn 15.

### Pass checklist (summary)

- Clarifying questions in **Portuguese**; no hard error.
- Summary (if any) stays thin — no invented funding, B2B, etc.
- Manual finish, not cap auto-finish.

---

## Quick comparison

| | Hortifruti | FlagPilot | ZapZap |
| --- | --- | --- | --- |
| First reply | Full pitch | Full pitch | Vague pt-BR pitch |
| Answer style | On-topic EN blocks | On-topic EN blocks | Vague → slightly clearer pt-BR |
| At `suggest_finish` | Keep sending extensions | **Finish** | **Finish** (thin OK) |
| Turn 15 auto-finish | **Yes — required** | **No** | **No** |

---

## Related docs

- Briefs + expected outcomes: [`ai-interview-test-briefs.md`](./ai-interview-test-briefs.md)
- Product flow: [`ai-interview.md`](./ai-interview.md)
- Engine (6 topics, cap, `suggest_finish`): `apps/hono-api/src/features/ai/docs/interview-engine.md`
