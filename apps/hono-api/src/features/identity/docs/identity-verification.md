# Identity Verification

## Overview

The identity system allows widget visitors to be linked to known users in the tenant's system. When a visitor calls `identify()`, their anonymous session is associated with identity data (name, email, externalId, metadata).

## Database

- **`visitor_identities`** table stores identity records with a unique constraint on `(anonymousUserId, organizationId)`.
- **`organization`** table has two new columns: `identityVerificationEnabled` (boolean, default false) and `identityVerificationSecret` (varchar 64, nullable).

## API Endpoint

`POST /api/v1/widget/identify`

### Headers

- `X-App-Id` (required) — widget authentication
- `X-Visitor-Id` (required) — anonymous visitor ID

### Body

```json
{
  "name": "string (optional, max 255)",
  "email": "string (optional, valid email, max 255)",
  "externalId": "string (optional, max 255)",
  "metadata": "object (optional, JSON key-value pairs)",
  "hmac": "string (optional, max 128, required when verification is enabled)"
}
```

At least one identity field (`name`, `email`, `externalId`, or `metadata`) must be provided.

### HMAC Verification Flow

When `identityVerificationEnabled` is true on the organization:

1. Both `externalId` and `hmac` are required (403 if missing).
2. The server computes `HMAC-SHA256(identityVerificationSecret, externalId)` and compares with the provided `hmac` using timing-safe comparison.
3. If the signature is invalid, returns 403.
4. If valid, the identity is stored with `hmacVerified = true`.

When verification is disabled (default), the endpoint accepts identify calls without HMAC, storing `hmacVerified = false`.

### Upsert Behavior

Uses `ON CONFLICT DO UPDATE` on the `(anonymousUserId, organizationId)` unique index. When a field is not provided in the request, the existing value in the database is preserved (not overwritten with null).

## SDK Integration

The SDK exposes `DeliveryChat.identify(params)` which calls this endpoint. Works in both widget and headless modes. Supports command queue replay for calls made before the SDK loads.
