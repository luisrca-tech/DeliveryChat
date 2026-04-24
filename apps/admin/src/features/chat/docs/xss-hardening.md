# Admin Chat — XSS Hardening (Rendering Discipline)

**Phase:** 1 of the [widget security roadmap](../../../../../../packages/docs/security/security-roadmap.md)
**Enforcement:** ESLint (`apps/admin/eslint.config.mjs`) + unit test

## Rule

`dangerouslySetInnerHTML` is forbidden across `apps/admin/src/`. React's default JSX escaping is the only supported render path for message content. ESLint (`no-restricted-syntax`) flags any reintroduction; the same rule also bans `innerHTML`, `outerHTML`, and `insertAdjacentHTML` so escape hatches below React are covered too.

## Why

Visitor messages arrive in the admin app unfiltered — anything a visitor types will reach an operator's screen. React escapes JSX children, which is all the admin currently needs. An accidental `dangerouslySetInnerHTML` would turn any malicious visitor message into executable markup in the operator's browser, inside the tenant's authenticated session.

## Audit

`apps/admin/src/` contains zero occurrences of `dangerouslySetInnerHTML`. Grep-based CI check is implicit in the ESLint rule — any new occurrence fails lint.

## Test

`components/MessageBubble.test.tsx` renders the bubble with hostile payloads in `message.content` and asserts the content appears as text via `screen.getByText(payload)`. It also checks that `<img onerror>` handlers never execute, confirming React's escape behavior end-to-end.

## If an exception is ever required

There is no approved exception path in Phase 1. If a future feature (e.g., markdown rendering) needs richer content:

1. Pipe the input through an allowlist sanitizer (DOMPurify or an equivalent in-repo utility) before rendering.
2. Document the sanitizer inputs/outputs in this file.
3. Keep the ESLint ban and disable the rule at exactly the rendering site with a justification comment.
