# DeliveryChat Documentation

Architecture guides, implementation references, and technical decision records for the DeliveryChat platform.

## Contents

### Core Foundation

- [Auth Integration](core-foundation/auth/auth-integration.md) — Better Auth multi-tenant setup, account lifecycle, email verification, roles
- [Better Auth Multi-Tenant Study Guide](core-foundation/auth/better-auth-multi-tenant-study-guide.md) — Mental model, design decisions, debugging checklist, extension guide
- [Infisical Architecture](core-foundation/infisical-architecture.md) — Secrets management setup, CLI workflow, production deployment
- [Multi-Tenant Secrets Strategy](core-foundation/multi-tenant-secrets-strategy.md) — Tenant-specific secrets: Infisical folders vs database encryption
- [Visitors Implementation](core-foundation/visitors-implementation.md) — Visitors system architecture, multi-tenant isolation, widget initialization

### Billing & Plans

- [Stripe Integration](billing-and-plans/stripe-plan.md) — Webhooks, RBAC billing middleware, trial control, enterprise workflow, admin UI

### Widget Embed

- [Embed Reference](embed/embed-widget.md) — Quick reference for widget consumers: init options, async loading, destroy API
- [How It Works](embed/how-it-works.md) — Shadow DOM isolation, CSS theming, settings flow, queue pattern

### Conversations & Messaging

- [Schema Design](conversations/schema.md) — Conversations, messages, participants, read status, anonymous visitors via Better Auth

### Rate Limiting

- [Redis Migration (TODO)](rate-limiting/to-do/redis-migration.md) — Migration plan from MemoryStore to Redis-backed rate limiting
