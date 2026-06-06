# Prompt Architecture

## Overview

The AI prompt system uses composable layers to build system prompts. Each layer is independently testable and can be composed in different combinations depending on the action being performed.

## Composition API

### `buildSystemPrompt({ action, tenantName, contextSummary? })`

Single public entry point for all system prompt generation. Composes:

1. **Role introduction** — action-specific opening line identifying the AI's role
2. **Guard rails** — safety rules applied to all actions
3. **Action instructions** — behavior specific to `generate`, `improve`, or `interview`
4. **Application context** — optional per-app context summary

## Composable Layers

### `baseGuardRails()`

Renders five safety categories from separate named constant arrays. These are hardcoded and identical for all tenants and actions.

| Category | Constant | Purpose |
|----------|----------|---------|
| Security | `SECURITY_RULES` | Prevents prompt injection, system prompt disclosure |
| Data & Honesty | `DATA_HONESTY_RULES` | Prevents hallucination of facts, prices, tracking info |
| Authority | `AUTHORITY_RULES` | Prevents unauthorized promises, refunds, commitments |
| Scope | `SCOPE_RULES` | Keeps responses on-topic for customer support |
| Identity | `IDENTITY_RULES` | Prevents impersonation, maintains AI identity |

### `actionInstructions(action)`

Returns action-specific behavioral instructions plus shared `MARKDOWN_FORMAT_INSTRUCTIONS`.

- **`generate`** — draft a helpful reply matching customer language
- **`improve`** — rewrite the operator's existing draft preserving intent

### `applicationContext(summary?)`

Returns formatted application context block or empty string if no summary is provided.

## Guard Rail Design Principles

- Each category is a separate named constant array for independent testing
- Rules are declarative ("Do not...") rather than procedural
- No tenant-specific customization — guard rails are universal
- Categories cover the OWASP LLM Top 10 attack vectors relevant to customer support

## File Location

All prompt composition logic lives in `ai.context.ts`. The legacy `buildImprovePrompt()` function has been removed — all callers use `buildSystemPrompt()` with the unified signature.

## Interview prompt injections

The interview engine builds its system prompt from `INTERVIEWER_SYSTEM_PROMPT` (in `ai.prompts.interview.ts`) and stacks **phase-specific system messages** onto the message array in `buildAdvanceMessages(...)`. Each injection is gated by an independent predicate so combinations stay explicit and testable:

| Injection                        | Gate                                                                                       | Purpose                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Turn-budget note                 | every advance turn                                                                         | Tell the LLM the remaining turn budget so it can pace follow-ups.                                        |
| Soft-finish-window suggestion    | `allTopicsCovered && nextTurn ∈ [SOFT_FINISH_WINDOW_MIN, SOFT_FINISH_WINDOW_MAX]`           | Permit `intent='suggest_finish'` once coverage is complete and we are in the natural wrap-up window.     |
| `DISCOVERY_PHASE_SYSTEM_MESSAGE` | `allTopicsCovered && nextTurn > SOFT_FINISH_WINDOW_MIN`                                    | Activate the classify-then-act Discovery rules (`relevant` / `irrelevant` / `duplicate`).               |
| Final-question framing           | `nextTurn === MAX_TURNS`                                                                   | Force `intent='final_question'` and frame the message as the last one. The server also overrides intent. |
| Push-back marker reminder        | any prior turn left `garbagePushbackTopics` markers                                        | Tell the LLM to use `accept_garbage` if the admin's next attempt is still imperfect on those topics.     |

The base `INTERVIEWER_SYSTEM_PROMPT` only documents that `extraContextRelevance` and `followUpQuestion` are optional fields the LLM may set; the **rules** for when and how to set them live in `DISCOVERY_PHASE_SYSTEM_MESSAGE`. This keeps the base prompt compact and reserves phase-specific instructions to turns where they apply.

The hardcoded `assistantMessage` override on `intent='suggest_finish'` turns has been removed: LLM-authored assistant messages are now authoritative in the Discovery phase. `SUGGEST_FINISH_CLOSING_MESSAGE` is kept as an exported constant for reference but is no longer persisted.
