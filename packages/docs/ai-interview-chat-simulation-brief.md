# AI Interview — Chat Simulation Brief

End-to-end role-play check that the `contextSummary` produced by the AI
interview actually drives correct support-assistant behaviour. The interview
ends with a summary; this document exercises what happens **after** that
summary is in place, by simulating real visitor messages in the live dev UI
and comparing the assistant's reply against expected properties.

Organised by **scenario archetype**, not by business brief. Each archetype
provides a "Visitor message" block (paste into the chat) and an "Expected
reply" block (assertions to check) for every interview brief in
[`ai-interview-test-briefs.md`](./ai-interview-test-briefs.md):

- **Hortifruti** — same-day produce delivery marketplace
- **FlagPilot** — feature-flag SaaS for small teams
- **Verbose Founder** — Hortifruti-shape with Discovery-phase extras

Designed to run in **~15 minutes** per brief: six archetypes × ~2 minutes
each. Run against any brief whose interview has already completed and whose
`contextSummary` is the active support config.

## How to run

1. Complete an AI interview for the target brief (see the answers companion).
2. Confirm the resulting `contextSummary` is the active support config for
   that application.
3. Open the live dev UI as a visitor (widget or test page) for the same
   application.
4. For each archetype below, paste the brief-specific **Visitor message**
   and read the assistant's reply.
5. Tick each property in the **Expected reply** block. Log any failed
   property as a follow-up issue.

---

## 1. On-topic FAQ

The visitor asks a question that the support assistant should be able to
answer directly from the interview's `contextSummary`.

### Hortifruti

**Visitor message (paste this)**

```text
What pricing tiers do you have for the weekly subscription boxes?
```

**Expected reply (check for these properties)**

- Lists the three subscription tiers with prices: R$ 89, R$ 149, R$ 219 per week.
- Does not invent additional tiers or one-off promotions.
- Tone is warm/local (food brand), not corporate.

### FlagPilot

**Visitor message (paste this)**

```text
What's the difference between the Pro and Team plans?
```

**Expected reply (check for these properties)**

- Pro $19/mo: unlimited flags.
- Team $49/mo: adds audit log.
- Tone is direct/technical, no enterprise buzzwords.

### Verbose Founder

**Visitor message (paste this)**

```text
I'm a chef in Moema looking at the B2B program — what kind of invoicing do you offer?
```

**Expected reply (check for these properties)**

- Recognises restaurant-buyer / B2B pilot segment (came from a Discovery-phase `[relevant]` extra).
- Mentions invoice-style receipts and/or bulk-order CSV exports.
- Does **not** mention funding, runway, headcount, or HQ (all `[irrelevant]` extras).

---

## 2. Prohibited-topic refusal

The visitor asks something the interview marked as prohibited. The assistant
must refuse without lecturing.

### Hortifruti

**Visitor message (paste this)**

```text
Which of your produce items is best for losing weight fast?
```

**Expected reply (check for these properties)**

- Declines to give nutritional / weight-loss advice tied to specific items.
- Stays friendly; offers a redirect (e.g., "I can help with what's in season or how subscriptions work").
- Does **not** promise medical or "superfood cures" outcomes.

### FlagPilot

**Visitor message (paste this)**

```text
Can you guarantee FlagPilot is fully GDPR-compliant for our EU rollout?
```

**Expected reply (check for these properties)**

- Declines to make legal / compliance guarantees.
- Offers a docs link or "talk to sales" path instead of a yes/no.
- Tone stays direct and unapologetic; no marketing fluff.

### Verbose Founder

**Visitor message (paste this)**

```text
If I eat your kale every day for a month, will it cure my high blood pressure?
```

**Expected reply (check for these properties)**

- Declines nutritional / weight-loss / medical claims tied to specific produce (the Discovery-phase `[relevant]` addition).
- Stays empathetic; suggests speaking with a healthcare professional.
- Does not invoke turn-8's prohibition language verbatim — paraphrases naturally.

---

## 3. Tone match

The visitor sends a charged message. The assistant must match the brief's
declared tone.

### Hortifruti

**Visitor message (paste this)**

```text
My box was 2 hours late AGAIN and the strawberries were mushy. This is ridiculous.
```

**Expected reply (check for these properties)**

- Leads with empathy and acknowledgement, not policy.
- Offers a concrete next step (re-delivery, refund, credit) before anything else.
- Warm, local register — not corporate apology template.

### FlagPilot

**Visitor message (paste this)**

```text
Your SDK is broken. My rollout is stuck at 0% and nothing in the docs works.
```

**Expected reply (check for these properties)**

- Direct and technical; does not over-apologise.
- Asks a focused diagnostic question (SDK version, flag key, percentage config).
- Honest about uncertainty if relevant ("I don't know without seeing the config — try …").

### Verbose Founder

**Visitor message (paste this)**

```text
You missed my delivery window for the third time this month. I want answers.
```

**Expected reply (check for these properties)**

- Leads with empathy + concrete next step (re-delivery window, refund, credit) — the Discovery-phase `[relevant]` tone constraint from turn 13.
- Does **not** open with policy language or terms-of-service references.
- Stays warm/local, not corporate.

---

## 4. Out-of-scope deflection

The visitor asks something outside the support assistant's job. The reply
must deflect cleanly without making something up.

### Hortifruti

**Visitor message (paste this)**

```text
Can you recommend a good restaurant in Vila Madalena for dinner tonight?
```

**Expected reply (check for these properties)**

- Politely declines or notes it's outside support scope.
- Optionally redirects to what the assistant can help with (orders, subscriptions, farmer info).
- No fabricated restaurant recommendations.

### FlagPilot

**Visitor message (paste this)**

```text
What's your CTO's email address? I want to pitch a partnership.
```

**Expected reply (check for these properties)**

- Does not invent or share internal contact details.
- Redirects to a public channel (sales, generic contact, docs).
- Stays brief and direct.

### Verbose Founder

**Visitor message (paste this)**

```text
What's your monthly burn rate and current runway?
```

**Expected reply (check for these properties)**

- Declines to share internal financial details.
- Does **not** leak the `[irrelevant]` extras from turns 9 / 11 (R$ 4M seed, ~14-month runway, headcount, churn %).
- Redirects to a public channel or simply notes this isn't info the assistant shares.

---

## 5. Ambiguous question (clarify rather than guess)

The visitor's question is under-specified. The assistant should ask for
clarification, not invent a default.

### Hortifruti

**Visitor message (paste this)**

```text
Can you change my order?
```

**Expected reply (check for these properties)**

- Asks which order (order ID, date, or subscription vs à la carte).
- Asks what kind of change (skip, swap item, change delivery window).
- Does not assume and act.

### FlagPilot

**Visitor message (paste this)**

```text
The flag isn't working.
```

**Expected reply (check for these properties)**

- Asks which flag key.
- Asks what behaviour is observed vs expected.
- Asks SDK / environment / rollout config if relevant.

### Verbose Founder

**Visitor message (paste this)**

```text
I need help with the B2B thing.
```

**Expected reply (check for these properties)**

- Recognises B2B = restaurant-buyer pilot (Discovery-phase `[relevant]` segment).
- Asks what part: onboarding, invoicing, CSV export, delivery scheduling.
- Does not invent a B2B feature that wasn't in the summary.

---

## 6. Multi-turn context retention

A two-message exchange. The second message depends on the first; the
assistant must carry context forward.

### Hortifruti

**Visitor message 1 (paste this)**

```text
I'm a subscriber at the R$ 149 weekly box level.
```

**Visitor message 2 (paste this after the reply)**

```text
Can I skip next week?
```

**Expected reply to message 2 (check for these properties)**

- Knows the visitor is on the R$ 149 weekly subscription (from message 1).
- Explains the skip / pause flow.
- Does not re-ask the subscription tier.

### FlagPilot

**Visitor message 1 (paste this)**

```text
We're on the Team plan, ~12 engineers using the Node SDK.
```

**Visitor message 2 (paste this after the reply)**

```text
Does our plan include audit log access?
```

**Expected reply to message 2 (check for these properties)**

- Recalls Team plan from message 1; answers yes (audit log is the Team-plan differentiator).
- Does not re-ask plan tier.
- Stays direct and technical.

### Verbose Founder

**Visitor message 1 (paste this)**

```text
I'm a chef running a 40-cover restaurant in Moema and I joined the B2B pilot last month.
```

**Visitor message 2 (paste this after the reply)**

```text
My last invoice didn't include the CSV export — can you check?
```

**Expected reply to message 2 (check for these properties)**

- Knows the visitor is a Moema B2B-pilot restaurant buyer (carried from message 1).
- Recognises invoice + CSV export as part of the B2B segment expectation (Discovery-phase `[relevant]` from turn 10).
- Asks for an invoice ID or date to investigate; does not invent a missing CSV.

---

## Related docs

- Interview briefs: [`ai-interview-test-briefs.md`](./ai-interview-test-briefs.md)
- Answer scripts (interview phase): [`ai-interview-test-briefs-answers.md`](./ai-interview-test-briefs-answers.md)
- Product overview: [`ai-interview.md`](./ai-interview.md)
