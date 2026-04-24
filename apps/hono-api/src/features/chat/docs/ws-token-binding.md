# WebSocket Token Binding

## Overview

Widget WebSocket connections are authenticated using a short-lived HMAC-SHA256 signed token bound to the tuple `(appId, origin, visitorId)`. This replaces the previous approach where `appId` and `visitorId` were passed as plaintext query parameters.

## Token lifecycle

1. **Issuance:** Widget calls `POST /v1/widget/ws-token` with `X-App-Id` and `X-Visitor-Id` headers. The endpoint validates the application exists and the request origin is allowed (via `widgetAuth` middleware), then signs a token containing `{ appId, origin, visitorId, iat, exp }`.

2. **Transport:** Widget connects to `ws(s)://host/v1/ws?token=<signed-token>`. The token is the only query parameter.

3. **Verification:** On WS upgrade, the server verifies:
   - Signature integrity (HMAC-SHA256 with `WS_TOKEN_SECRET`)
   - Token has not expired (`exp > now`)
   - Origin in the token matches the `Origin` header of the WS upgrade request
   - The referenced application still exists

4. **Expiry:** Token TTL is 120 seconds by default. On reconnect, the widget fetches a fresh token automatically.

## Error codes

Each verification failure returns a distinct error code on the WebSocket before closing with code 1008:

| Error code | Meaning |
|---|---|
| `INVALID_TOKEN` | Malformed token or HMAC signature mismatch |
| `EXPIRED_TOKEN` | Token `exp` claim is in the past |
| `ORIGIN_MISMATCH` | `Origin` header does not match the origin bound in the token |
| `APP_NOT_FOUND` | Application referenced by `appId` no longer exists |
| `UNAUTHORIZED` | Session-based auth failure (admin/operator path) |

## Security properties

- **Unforgeable:** Requires knowledge of `WS_TOKEN_SECRET` (stored in Infisical, never exposed).
- **Origin-bound:** Token is valid only from the origin where it was issued. Replay from a different origin is rejected.
- **Short-lived:** 120s TTL prevents long-term token reuse. Expired tokens require re-issuance.
- **Visitor-bound:** `visitorId` is embedded in the signed payload. Changing the visitor requires a new token.

## Configuration

- `WS_TOKEN_SECRET` — minimum 32 characters, loaded via Infisical. Must never be hardcoded or logged.
