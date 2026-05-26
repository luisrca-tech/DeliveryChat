# AI Usage Audit Route

## Overview

`GET /v1/ai/usage` provides paginated access to the `aiUsageLog` table for admin and super_admin users. Operators cannot access this endpoint.

## Route Details

- **Path:** `GET /api/v1/ai/usage`
- **Auth:** `requireTenantAuth()` + `requireRole("admin")`
- **Billing:** `checkBillingStatus()` applied

## Query Parameters

| Parameter  | Type   | Default | Description                              |
|------------|--------|---------|------------------------------------------|
| `limit`    | number | 20      | Results per page (1–100)                 |
| `offset`   | number | 0       | Pagination offset                        |
| `action`   | string | —       | Filter by action: `generate`, `improve`  |
| `status`   | string | —       | Filter by status (6 enum values)         |
| `userId`   | string | —       | Filter by operator user ID               |
| `dateFrom` | string | —       | ISO date string lower bound on createdAt |
| `dateTo`   | string | —       | ISO date string upper bound on createdAt |

## Response Shape

```json
{
  "logs": [
    {
      "id": "uuid",
      "tenantId": "org-id",
      "userId": "user-id",
      "operatorName": "Jane Doe",
      "action": "generate",
      "conversationId": "uuid | null",
      "model": "groq/llama-3.3-70b",
      "inputTokens": 150,
      "outputTokens": 60,
      "latencyMs": 1200,
      "finishReason": "stop",
      "status": "success",
      "createdAt": "2026-05-25T10:00:00.000Z"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

## Privacy

No prompt content or AI response text is stored in the `aiUsageLog` table. The route only exposes metadata: who used it, when, which action, token counts, and latency.

## Key Decisions

- The usage route shares `requireTenantAuth()` and `checkBillingStatus()` with action routes, but uses `requireRole("admin")` instead of `requireRole("operator")` and does NOT apply `requireAiFeature()` or rate limiting — admins should always be able to audit usage regardless of quota state.
- Operator name is resolved via a `LEFT JOIN` on the `user` table, so deleted users show `null` for `operatorName`.
- Pagination uses offset-based approach (consistent with other list routes in the codebase).
