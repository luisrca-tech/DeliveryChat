# API Keys Feature

## Business Rules

- Administrators can generate unique API keys per application for tenant integrations.
- API key limits are plan-based: FREE=3, BASIC=5, PREMIUM=10, ENTERPRISE=1000 per application.
- API keys are shown in full only once at creation; afterward only a masked prefix is displayed.
- Keys can be revoked or regenerated; regeneration atomically invalidates the old key and creates a new one.
- Keys are scoped to a single application and validated via `X-App-Id` on every request.

## Technical Decisions

### SHA-256 vs bcrypt for Key Storage

Keys are hashed with SHA-256 (not bcrypt) for verification. SHA-256 is deterministic, enabling O(1) database lookup by hash. The key itself provides ~190 bits of entropy, so brute-force resistance from bcrypt is unnecessary. bcrypt would add ~100–300ms per request.

### Key Format

`dk_{env}_{32 base62 chars}` — e.g. `dk_live_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6`

- `dk` = delivery chat
- `env` = `live` or `test`
- 32 random base62 characters

### Max Keys and Collision Retry

- Plan-based limits (see Business Rules); ENTERPRISE capped at 1000.
- Up to 3 insert retries on unique constraint violation (key_hash) before failing.

### Origin Validation

For iframe/widget routes, `requireApiKeyAuth({ validateOriginHeader: true })` validates the `Origin` header against `applications.domain`. Supports exact match, subdomains, and wildcard (`*.example.com`).

## Architecture

```
Admin (session) → POST/GET /applications/:id/api-keys
                → DELETE /api-keys/:keyId
                → POST /api-keys/:keyId/regenerate

Public (API key) → requireApiKeyAuth() → X-App-Id + Authorization: Bearer dk_live_...
```

## Integration Guide

### iframe

```html
<iframe src="https://chat.example.com/widget?appId=APP_UUID"></iframe>
```

Widget loads with `appId` only; no API key in the iframe.

### REST API / SDK

```ts
const response = await fetch("https://api.example.com/v1/public/visitors", {
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "X-App-Id": appId,
    "Content-Type": "application/json",
  },
});
```

### Regenerate vs Revoke

- **Revoke**: Invalidates the key immediately; no replacement.
- **Regenerate**: Revokes the old key and returns a new one (shown once). Accepts optional `name` and `expiresAt`; omitting `expiresAt` inherits from the old key.

### Optional expiresAt

Create accepts optional `expiresAt` (ISO 8601 datetime) for temporary keys. Keys past their expiry are rejected by `verifyApiKey`.

### List Response

`GET /applications/:id/api-keys` returns `limit` (plan-based max) and `used` (active key count) so the frontend can show e.g. "2 of 3 keys used".
