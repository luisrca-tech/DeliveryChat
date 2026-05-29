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
