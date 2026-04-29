# Query Monitor Middleware

## Purpose

Instruments every HTTP request with per-query database diagnostics to detect N+1 patterns, slow queries, and excessive query usage. Uses `AsyncLocalStorage` to track per-request query counts, SQL text, and timing without threading context through the call stack.

## How It Works

1. Middleware initializes a counter + query entries array in `AsyncLocalStorage` at the start of each request
2. The Drizzle `QueryCountingLogger` records each SQL query (truncated to 200 chars) with a `performance.now()` timestamp
3. After the handler completes, the middleware:
   - Optionally emits a `Server-Timing` response header with per-query breakdown
   - Checks the counter against the threshold and logs warnings
   - In development: logs every query with approximate duration

## Server-Timing Header

The `Server-Timing` header appears in the browser's DevTools Network tab under "Timing". It is emitted when:

- **Development mode** (`NODE_ENV=development`): always emitted, no auth required
- **Production**: only when the request includes `X-Debug-Timing: true` header AND the authenticated user has `super_admin` role

Format:

```
Server-Timing: db;dur=52;desc="3 queries", db.q1;dur=3;desc="SELECT * FROM conversations...", db.q2;dur=45;desc="SELECT COUNT(*)...", db.q3;dur=4;desc="UPDATE conversations..."
```

Per-query durations are approximated from timestamp gaps between consecutive `logQuery` calls.

### How to use in production

1. Open browser DevTools → Network tab
2. Add a custom request header: `X-Debug-Timing: true` (use a browser extension like ModHeader)
3. Navigate to the slow page
4. Click on the request → Timing tab → see `Server-Timing` breakdown

## Console Logging

### Warning (any environment)

When query count exceeds threshold, logs the alert + per-query SQL breakdown:

```
[QUERY ALERT] GET /v1/conversations — 5 queries in 312ms (threshold: 3)
  [QUERY] q1 ~2ms — SELECT * FROM conversations WHERE org_id = $1
  [QUERY] q2 ~45ms — SELECT COUNT(*) FROM conversations WHERE org_id = $1
  [QUERY] q3 ~180ms — SELECT * FROM messages WHERE conversation_id = $1
  [QUERY] q4 ~3ms — SELECT * FROM users WHERE id = $1
  [QUERY] q5 ~82ms — SELECT * FROM conversation_participants WHERE...
```

### Debug (development only)

Logs all requests with per-query breakdown:

```
[QUERY MONITOR] GET /v1/conversations — 3 queries in 52ms
  [QUERY] q1 ~3ms — SELECT * FROM conversations WHERE org_id = $1
  [QUERY] q2 ~45ms — SELECT COUNT(*) FROM conversations WHERE org_id = $1
  [QUERY] q3 ~4ms — UPDATE conversations SET updated_at = now()
```

## Configuration

- `QUERY_COUNT_THRESHOLD` env var (optional, default: 15)
- WebSocket upgrade requests are excluded automatically
- `Server-Timing` exposed via CORS `Access-Control-Expose-Headers`

## Files

- `src/lib/middleware/queryMonitor.ts` — Hono middleware (Server-Timing + logging)
- `src/lib/middleware/queryCounterStore.ts` — AsyncLocalStorage store, `recordQuery()`, `getQueryEntries()`
- `src/db/queryLogger.ts` — Drizzle Logger implementation that records SQL + timestamp
