# Query Monitor Middleware

## Purpose

Instruments every HTTP request with a database query counter to detect N+1 patterns and excessive query usage. Uses `AsyncLocalStorage` to track per-request query counts without threading context through the call stack.

## How It Works

1. Middleware initializes a counter in `AsyncLocalStorage` at the start of each request
2. The Drizzle `QueryCountingLogger` increments the counter on every SQL query
3. After the handler completes, the middleware checks the counter against the threshold
4. If exceeded: emits a `console.warn` with method, path, count, and duration
5. In development: emits `console.debug` for all requests regardless of threshold

## Configuration

- `QUERY_COUNT_THRESHOLD` env var (optional, default: 15)
- WebSocket upgrade requests are excluded automatically

## Warning Format

```
[QUERY ALERT] GET /v1/conversations — 47 queries in 312ms (threshold: 15)
```

## Files

- `src/lib/middleware/queryMonitor.ts` — Hono middleware
- `src/lib/middleware/queryCounterStore.ts` — AsyncLocalStorage store + increment helper
- `src/db/queryLogger.ts` — Drizzle Logger implementation that hooks into the counter
