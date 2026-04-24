# WebSocket Authentication

WebSocket connections support two authentication paths depending on the client type. Authentication runs during the `onOpen` phase — messages are queued until auth completes.

**Source:** `apps/hono-api/src/lib/middleware/wsAuth.ts`

## Authentication Paths

```
Client connects to GET /v1/ws
        │
        ├── Has ?token= query param?
        │     YES → Widget Authentication (Path A)
        │     NO  → Session Authentication (Path B)
        │
        ▼
  AuthenticatedWSUser returned
```

## Path A: Widget Authentication (Visitors)

Used by the embeddable chat widget. Visitors are anonymous Better Auth users. Authentication is a two-step process: first acquire a short-lived token via HTTP, then present it on WS upgrade.

### Step 1: Acquire a WS Token

```
POST /v1/widget/ws-token
Headers:
  X-App-Id: <application-uuid>
  X-Visitor-Id: <visitor-uuid>
  Origin: https://integrator-site.com
```

The endpoint validates the app ID and (optionally) the `Origin` against the application's allowed-origins list via `requireWidgetAuth()`, then signs an HMAC-SHA256 token binding:
- `appId` — the application UUID
- `origin` — the `Origin` header value (or `""` if absent)
- `visitorId` — the anonymous visitor ID

**Response:**
```json
{ "token": "<base64url-payload>.<base64url-signature>" }
```

**Token structure (`WsTokenPayload`):**
```typescript
{
  appId: string;
  origin: string;
  visitorId: string;
  iat: number;  // issued-at (unix seconds)
  exp: number;  // expires-at (iat + 120s)
}
```

### Step 2: Connect with Token

```
GET /v1/ws?token=<ws-token>
```

**Verification flow:**
1. Split token into `payload.signature`, verify HMAC-SHA256 with `WS_TOKEN_SECRET`
   - FAIL → error: `INVALID_TOKEN`
2. Check `exp` against current time
   - FAIL → error: `EXPIRED_TOKEN`
3. Compare `payload.origin` with connection's `Origin` header
   - FAIL → error: `ORIGIN_MISMATCH`
4. Look up `payload.appId` in the `applications` table
   - FAIL → error: `APP_NOT_FOUND`
5. Return `AuthenticatedWSUser` with `role: "visitor"`, `authType: "widget"`

### Token Properties

| Property | Value |
|---|---|
| Algorithm | HMAC-SHA256 |
| TTL | 120 seconds |
| Binding | `(appId, origin, visitorId)` |
| Transport | Query string (`?token=`) — required because the browser WebSocket API does not support custom headers |
| Replay | Not prevented within TTL window (accepted residual risk) |

## Path B: Session Authentication (Admin/Operators)

Used by the admin dashboard. Authenticated via Better Auth session tokens.

### Query Parameters

| Param | Required | Description |
|---|---|---|
| `sessionToken` | Optional | Session token (alternative to cookie-based auth) |
| `tenant` | Optional | Tenant slug (alternative to `X-Tenant-Slug` header) |

### Headers (alternatives to query params)

| Header | Description |
|---|---|
| `Cookie` | Better Auth session cookie |
| `X-Tenant-Slug` | Tenant subdomain slug |

### Validation Flow

1. Call `auth.api.getSession()` with session token/cookie
   - FAIL → error: `UNAUTHORIZED`
2. Resolve tenant slug (query param or header)
   - FAIL → error: `UNAUTHORIZED`
3. Look up organization by slug
   - FAIL → error: `UNAUTHORIZED`
4. Verify user is an active member of the organization
   - FAIL → error: `UNAUTHORIZED`
5. Map role: `super_admin` → `"admin"`, others passed through
6. Return `AuthenticatedWSUser` with `authType: "session"`

### Admin Connection URL

```
wss://api.example.com/v1/ws?tenant={slug}&sessionToken={token}
```

## AuthenticatedWSUser Interface

```typescript
interface AuthenticatedWSUser {
  userId: string;
  userName: string | null;
  organizationId: string;
  role: ParticipantRole;           // "visitor" | "operator" | "admin"
  authType: "session" | "widget";
  applicationId?: string;          // Only present for widget auth
}
```

## Rate Limiting & Connection Cap

- **WS upgrade rate limit:** IP-based rate limiter on the `/v1/ws` endpoint (5/s, 30/min, 200/hr) prevents connection spam before the upgrade occurs.
- **Per-user connection cap:** `InMemoryRoomManager` enforces a maximum of 5 concurrent connections per user. Exceeding the cap closes the connection with code `4009 connection_limit`.

## Security Considerations

1. **Token binding** prevents cross-origin replay — the signed `origin` must match the connection's `Origin` header
2. **Short TTL (120s)** limits the window for token theft and replay
3. **Organization membership** is verified for session auth — a valid session from another tenant is rejected
4. **Role mapping** ensures the WebSocket context uses the correct participant roles
5. **No cross-tenant access** — connections are scoped to a single organization via the room manager
6. **Token in query string** is a standard WebSocket limitation — mitigated by short TTL and single-purpose tokens
