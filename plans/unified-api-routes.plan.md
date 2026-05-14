# Plan: Unified API Routes & Prefix Migration

> Source PRD: `plans/unified-api-routes.md`

## Architectural decisions

Durable decisions that apply across all phases:

- **Prefix**: All routes move from `/v1/*` to `/api/v1/*`. Better Auth stays at `/api/auth/*` (unversioned).
- **Auth context**: `requireAuth()` produces a discriminated union: `type: "member"` (session, user, organization, membership) or `type: "visitor"` (visitorId, visitorUserId, application, apiKey).
- **Route composition**: `publicApi.ts` is deleted; its logic merges into `conversations.ts`. The `ws-token` endpoint moves to `widget.ts`.
- **Rate limiting**: Unified middleware branches on `auth.type` — tenant limiter for members, visitor limiter for visitors. Both remain in-memory.
- **No backward compatibility**: No redirects, no deprecation period — clean cutover.
- **WebSocket**: Endpoint moves to `/api/v1/ws`. Dual auth in `wsAuth.ts` unchanged beyond path.
- **Clients**: Admin RPC client, widget, embed script, and E2E tests all update in the same PR.

---

## Phase 1: Unified Auth Middleware + Per-Route Guards

**User stories**: 1, 24

### What to build

A `requireAuth()` middleware that tries session-based auth first and falls back to API key auth. On the session path it resolves tenant membership and produces `{ type: "member", session, user, organization, membership }`. On the API key path it validates the bearer token + `X-App-Id`, resolves or creates the visitor user from `X-Visitor-Id`, and produces `{ type: "visitor", visitorId, visitorUserId, application, apiKey }`. The existing `requireTenantAuth()` and `requireApiKeyAuth()` become internal helpers called by `requireAuth()`.

A `requireMember()` guard that reads the auth context and returns 403 if `auth.type !== "member"`. This runs after `requireAuth()` on member-only endpoints.

Both are tested in isolation with unit tests covering: member auth success, visitor auth success, missing credentials (401), visitor calling member-only endpoint (403), and the fallback order (session tried first).

### Acceptance criteria

- [x] `requireAuth()` middleware exists and produces the discriminated union context
- [x] Visitor resolution (X-Visitor-Id → user record) happens inside `requireAuth()` on the API key path
- [x] `requireMember()` guard returns 403 for visitor auth contexts
- [x] Unit tests cover both auth paths, fallback order, and rejection cases
- [x] Existing `requireTenantAuth()` and `requireApiKeyAuth()` still work as standalone helpers (no regression)

---

## Phase 2A: Read-Only Conversation Endpoints (Dual-Auth) ✅

**User stories**: 9, 10, 11

### What to build

Replace the auth middleware on `GET /conversations` and `GET /conversations/:id` (plus message history) with `requireAuth()`. The list endpoint branches on `auth.type`:

- **Member**: existing visibility rules — admins see all, operators see pending + their assigned.
- **Visitor**: scoped to conversations where the visitor is a participant. No access to other visitors' data.

The get-single and message-history endpoints verify the caller is a participant (member via org membership, visitor via participant record).

### Acceptance criteria

- [x] `GET /conversations` works for both member and visitor auth
- [x] Visitor list is scoped to only their own conversations
- [x] Operator visibility: pending (queue) + own active conversations
- [x] Admin visibility: all conversations
- [x] `GET /conversations/:id` and message history verify participant access for both auth types
- [x] Integration tests cover member list, visitor list, and cross-visitor isolation

### Risks

- **`APIType` shape change**: Read endpoints now have `requireAuth()` middleware instead of `requireTenantAuth()`, which changes the inferred Hono types. The admin frontend RPC client (`hc<APIType>`) should be verified in Phase 5 to ensure no type breakage on the read endpoints.

---

## Phase 2B: Write Endpoints — Messages, Read Receipts, Unread

**User stories**: 3, 4, 14, 15, 16

### What to build

Merge the visitor write endpoints from `publicApi.ts` into `conversations.ts` under `requireAuth()`:

- **Create conversation** (`POST /conversations`): visitors create conversations scoped to their application; members can also create (existing behavior if any).
- **Send message** (`POST /conversations/:id/messages`): both auth types, participant guard applied.
- **Edit message** (`PATCH /conversations/:id/messages/:messageId`): both auth types, ownership check (sender must match caller).
- **Delete message** (`DELETE /conversations/:id/messages/:messageId`): both auth types, ownership check.
- **Mark as read** (`POST /conversations/:id/read`): both auth types, participant guard.
- **Unread count** (`GET /conversations/:id/unread`): both auth types, participant guard.

All write operations call the existing chat service layer. Zod schemas from `publicApi.ts` are consolidated with any overlapping schemas in `conversations.ts`.

### Acceptance criteria

- [x] Visitors can create conversations via `POST /conversations`
- [x] Both auth types can send, edit, and delete messages (with ownership enforcement)
- [x] Read receipts and unread counts work for both auth types
- [x] Participant guard prevents access to conversations the caller doesn't belong to
- [x] Duplicate Zod schemas consolidated
- [x] Integration tests cover visitor create, member send, edit/delete ownership rejection

### Risks

- **`POST /:id/read` contract change**: The old member-only endpoint auto-detected the latest message; the new dual-auth version requires an explicit `messageId` in the request body (`markAsReadBodySchema`). The admin frontend currently calls `POST /:id/read` without a body — it will break until updated in Phase 5 to send `{ messageId }`.
- **Duplicate routes during transition**: Both `publicApi.ts` and `conversations.ts` now serve overlapping write endpoints (create conversation, send/edit/delete message, read receipts, unread). Until `publicApi.ts` is deleted in Phase 2C, widget clients hitting the old `/api/conversations/*` path via publicApi still work, but any behavioral divergence between the two copies is a silent bug risk.
- **Member participant guard gap on send**: Members who are not yet participants (e.g. an admin viewing a pending conversation) can still send messages because the endpoint falls back to an org-membership check (`getConversationWithParticipants`) instead of strictly requiring participant status. This is intentional (admins need to intervene), but means the `isParticipant` check is not a universal gate for members on write endpoints.
- **`APIType` shape change**: Adding `POST /`, `POST /:id/messages`, `PATCH /:id/messages/:messageId`, `DELETE /:id/messages/:messageId`, and `GET /:id/unread` under `requireAuth()` changes the inferred Hono types. The admin frontend RPC client should be verified in Phase 5 to ensure no type breakage.

---

## Phase 2C: Member-Only Endpoints + Route Cleanup ✅

**User stories**: 2, 17

### What to build

Apply `requireMember()` guard to the member-only conversation endpoints:

- `POST /conversations/:id/accept`
- `POST /conversations/:id/leave`
- `POST /conversations/:id/resolve`
- `DELETE /conversations/:id`
- `PATCH /conversations/:id/subject`

Move the `ws-token` endpoint from `publicApi.ts` to `widget.ts`. Remove the `publicApiRoute` import and `.route("/api", publicApiRoute)` line from `api.ts`. Delete `publicApi.ts`.

### Acceptance criteria

- [x] All five member-only endpoints reject visitor requests with 403
- [x] `ws-token` endpoint works from `widget.ts` with API key auth (was already there)
- [x] `publicApi.ts` is deleted
- [x] `api.ts` no longer references `publicApiRoute`
- [x] No regression in existing member-only operations
- [x] Tests verify visitor 403 on each member-only endpoint

### Risks

- **`requireRole()` incompatible with unified auth context**: `requireRole()` reads from `getTenantAuth(c)` which uses the `auth` context key, but `requireAuth()` sets `unifiedAuth`. The delete endpoint works around this with an inline role check. If more endpoints need role guards under unified auth, a dedicated `requireMemberRole()` should be created in `unifiedAuth.ts`.
- **`participant-guard.ts` is orphaned**: Was only imported by `publicApi.ts`. No route currently uses it. Retained for potential future use but could be deleted.
- **`APIType` shape change**: Removing `.route("/api", publicApiRoute)` changes the exported type. Any RPC calls targeting `/api/conversations/*` or `/api/ws-token` will fail at compile time. The admin frontend should only reference `/conversations/*`. Verify in Phase 5.
- **Widget clients unaffected**: Widget uses `/widget/*` routes via `widget.ts` with `requireWidgetAuth()`, not the deleted `/api/*` paths. No migration needed for widget clients.

---

## Phase 3: Unified Rate Limiting ✅

**User stories**: 12, 13

### What to build

A `createUnifiedRateLimitMiddleware()` that runs after `requireAuth()` on conversation routes. It reads `auth.type` from context and delegates to the correct limiter:

- **Member** (`auth.type === "member"`): existing tenant rate limiter (three chained windows per org).
- **Visitor** (`auth.type === "visitor"`): existing visitor rate limiter (per-visitor bucket).

This replaces the current separate `createTenantRateLimitMiddleware()` and `createVisitorRateLimitMiddleware()` calls on conversation routes. Both underlying limiters remain in-memory.

### Acceptance criteria

- [x] Unified middleware applies correct limiter based on auth type
- [x] Visitor abuse does not consume the tenant's rate limit bucket
- [x] Tenant rate limiting still applies to member requests
- [x] Rate limit headers returned correctly for both paths
- [x] Unit tests cover both branches and verify bucket isolation

### Risks

- **In-memory store lifecycle**: `createUnifiedRateLimitMiddleware()` instantiates two internal `createRateLimiter()` calls, each with its own set of `MemoryStore` instances. If the route module is re-imported (hot reload, test re-evaluation), stores reset and rate limit state is lost. Acceptable for single-instance deployments; a Redis-backed store would be needed for multi-instance horizontal scaling.
- **Route-level `.use("*")` ordering**: The unified rate limiter runs on ALL conversation endpoints including reads. This is intentional (visitors were previously unprotected on dual-auth endpoints), but increases 429 risk for legitimate high-frequency polling by the admin dashboard. Monitor after deployment.
- **Dual-auth endpoints now rate-limited**: Prior to this phase, `GET /conversations`, `GET /:id`, `GET /:id/messages`, `POST /`, `POST /:id/messages`, `PATCH /:id/messages/:messageId`, `DELETE /:id/messages/:messageId`, `POST /:id/read`, and `GET /:id/unread` had NO rate limiting. They now share the tenant/visitor bucket. If an org's existing rate limit config is too tight, reads could start failing.
- **Widget route still uses separate `createVisitorRateLimitMiddleware`**: The `widget.ts` route retains its own visitor rate limit middleware (from `visitorRateLimitInstance.ts`). Both the widget route and conversation route create independent visitor stores — a visitor hitting both paths gets independent budgets per route group. This is fine but means the visitor's effective budget is 2× the configured per-second/minute/hour limits across both route groups.

---

## Phase 4: URL Prefix Migration (`/v1` → `/api/v1`) ✅

**User stories**: 1, 7, 8, 20, 21, 22, 23

### What to build

Change the route mount point in `index.ts` from `.route("/v1", api)` and `.route("/v1", wsRoute)` to `.route("/api/v1", api)` and `.route("/api/v1", wsRoute)`. Better Auth stays at `/api/auth/*`.

Update CORS middleware path check from `/v1/widget/` to `/api/v1/widget/`. Update `queryMonitorMiddleware` route thresholds. Update any other internal references to `/v1/` paths (health checks, hardcoded strings).

Widget settings endpoint is now at `/api/v1/widget/settings/:appId`. WebSocket token at `/api/v1/widget/ws-token`. WebSocket connection at `/api/v1/ws`.

### Acceptance criteria

- [x] All API routes respond at `/api/v1/*`
- [x] Better Auth remains at `/api/auth/*`
- [x] `/v1/*` paths return 404 (no redirects)
- [x] CORS allows widget origins on `/api/v1/widget/*` paths
- [x] WebSocket endpoint works at `/api/v1/ws`
- [x] E2E smoke test passes against new paths

---

## Phase 5: Client Updates + WebSocket Broadcasting

**User stories**: 5, 6, 18, 19

### What to build

**Admin frontend**: Update Hono RPC client base URL to `/api/v1`. TypeScript compilation must pass with zero errors — the type system surfaces all broken calls.

**Widget**: Update API base URL references. The centralized `VITE_API_BASE_URL` env var simplifies this. Update ~7 files under `apps/widget/src/widget/` that reference `/v1/`.

**Embed script**: Ensure `widget.iife.js` works with the new prefix. The embed build uses the same env var.

**E2E tests**: Update all hardcoded paths in `apps/hono-api/e2e/`.

**WebSocket broadcasting**: Ensure all message operations (send, edit, delete) in the unified `conversations.ts` broadcast WebSocket events regardless of auth type. Visitor-sent messages trigger `message:new` events so the admin dashboard updates in real-time, and vice versa.

### Acceptance criteria

- [ ] Admin frontend compiles with zero TypeScript errors
- [ ] Widget initializes and communicates with the API at `/api/v1`
- [ ] Embed script (`widget.iife.js`) works with new prefix
- [ ] E2E tests pass with updated paths
- [ ] Visitor-sent messages broadcast WebSocket events to operators
- [ ] Operator-sent messages broadcast WebSocket events to visitors
- [ ] `APIType` export reflects the merged route structure

---

## Phase 6: Service Layer Extraction + Cleanup

**User stories**: (structural improvement, no new user stories)

### What to build

Extract any remaining inline database query logic from `conversations.ts` route handlers into the chat service layer (`chat.service.ts`). Route handlers should be thin: parse input, call service, return response. Both member and visitor code paths call the same service functions with appropriate scoping parameters.

Clean up unused imports, dead code from the merge, and any orphaned test files. Review `docs/` under the chat feature to reflect the unified architecture.

### Acceptance criteria

- [ ] No inline `db.select()`/`db.insert()` calls remain in `conversations.ts` route handlers
- [ ] Route handlers are thin wrappers: validate → call service → respond
- [ ] All existing tests pass
- [ ] Feature docs updated to reflect unified routes and auth model
- [ ] No orphaned files or dead imports from the migration
