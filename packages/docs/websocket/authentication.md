# WebSocket Authentication

WebSocket connections support two authentication paths depending on the client type. Authentication runs during the `onOpen` phase — messages are queued until auth completes.

**Source:** `apps/hono-api/src/lib/middleware/wsAuth.ts`

## Authentication Paths

```
Client connects to GET /v1/ws
        │
        ├── Has appId + visitorId query params?
        │     YES → Widget Authentication (Path A)
        │     NO  → Session Authentication (Path B)
        │
        ▼
  AuthenticatedWSUser returned
```

## Path A: Widget Authentication (Visitors)

Used by the embeddable chat widget. Visitors are anonymous Better Auth users identified by `visitorId`.

### Query Parameters

| Param | Required | Description |
|---|---|---|
| `appId` | Yes | Application ID (UUID) registered in the `applications` table |
| `visitorId` | Yes | Anonymous user ID from Better Auth's anonymous plugin |

### Validation Flow

```
1. Validate appId exists in `applications` table
     └── FAIL → error: UNAUTHORIZED ("Invalid application")

2. Validate Origin header matches application's registered domain
     └── FAIL → error: UNAUTHORIZED ("Origin not allowed")
     └── EXCEPTION: localhost origins bypass check in non-production env

3. Return AuthenticatedWSUser:
     {
       userId: visitorId,
       userName: null,
       organizationId: application.organizationId,
       role: "visitor",
       authType: "widget",
       applicationId: appId
     }
```

### Widget Connection URL

```
ws[s]://api.example.com/v1/ws?appId={uuid}&visitorId={visitorId}
```

### Origin Validation

The widget's domain must match the `domain` field in the `applications` table. This prevents unauthorized sites from connecting to a tenant's WebSocket. In development, `localhost` origins bypass this check when `NODE_ENV !== "production"`.

## Path B: Session Authentication (Admin/Operators)

Used by the admin dashboard. Authenticated via Better Auth session tokens.

### Query Parameters

| Param | Required | Description |
|---|---|---|
| `sessionToken` | Optional | Session token (alternative to cookie) |
| `tenant` | Optional | Tenant slug (alternative to `X-Tenant-Slug` header) |

### Headers (alternatives to query params)

| Header | Description |
|---|---|
| `Cookie` | Better Auth session cookie |
| `X-Tenant-Slug` | Tenant subdomain slug |

### Validation Flow

```
1. Call auth.api.getSession() with session token/cookie
     └── FAIL → error: UNAUTHORIZED ("Invalid session")

2. Resolve tenant slug (query param or header)
     └── FAIL → error: UNAUTHORIZED ("Tenant required")

3. Look up organization by slug
     └── FAIL → error: UNAUTHORIZED ("Organization not found")

4. Verify user is an active member of the organization
     └── FAIL → error: UNAUTHORIZED ("Not a member")

5. Map role:
     - super_admin → "admin" (WebSocket context)
     - admin → "admin"
     - operator → "operator"

6. Return AuthenticatedWSUser:
     {
       userId: session.user.id,
       userName: session.user.name,
       organizationId: organization.id,
       role: mappedRole,
       authType: "session"
     }
```

### Admin Connection URL

```
wss://api.example.com/v1/ws?tenant={slug}&sessionToken={token}
```

## AuthenticatedWSUser Interface

The result of successful authentication, attached to every WebSocket connection:

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

## WSConnection

Each authenticated connection is represented as:

```typescript
interface WSConnection {
  id: string;              // Unique connection ID (UUID)
  ws: WSContext;           // Hono WebSocket context (send/close methods)
  user: AuthenticatedWSUser;
}
```

## Security Considerations

1. **Origin validation** prevents unauthorized domains from connecting via widget auth
2. **Organization membership** is verified for session auth — a valid session from another tenant is rejected
3. **Role mapping** ensures the WebSocket context uses the correct participant roles for authorization checks in event handlers
4. **No cross-tenant access** — connections are scoped to a single organization via the room manager
5. **Localhost bypass** only applies in non-production environments for development convenience
