# Rate Limiting: Redis Migration To-Do

## Why Migrate to Redis?

The current implementation uses **MemoryStore** (in-memory) for rate limit counters. This works for single-instance deployments but has limitations:

- **Data loss on restart**: Counters reset when the server restarts.
- **No cross-instance sharing**: With multiple API instances (e.g. horizontal scaling, load balancers), each instance maintains its own counters. A tenant could exceed limits by spreading requests across instances.
- **No usage stats persistence**: Historical usage in the admin UI is incomplete after restarts.

Redis provides a shared, persistent store that all instances can use, ensuring consistent rate limiting across the fleet.

---

## Migration Steps

### 1. Add Dependencies

```bash
cd apps/hono-api && bun add @hono-rate-limiter/redis @upstash/redis
```

**Alternative**: Use `ioredis` or `@vercel/kv` if your infrastructure prefers them. The `RedisStore` accepts any client implementing:

```ts
type RedisClient = {
  scriptLoad: (script: string) => Promise<string>;
  evalsha: <TArgs extends unknown[], TData = unknown>(sha1: string, keys: string[], args: TArgs) => Promise<TData>;
  decr: (key: string) => Promise<number>;
  del: (key: string) => Promise<number>;
};
```

### 2. Environment Variables

Add to Infisical / `.env`:

```
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

(Or equivalent for your Redis provider.)

### 3. Update `rateLimit.ts`

**Current** (`apps/hono-api/src/lib/middleware/rateLimit.ts`):

```ts
import { rateLimiter, MemoryStore } from "hono-rate-limiter";

const stores = WINDOWS.map(() => new MemoryStore());
```

**After migration**:

```ts
import { rateLimiter } from "hono-rate-limiter";
import { RedisStore } from "@hono-rate-limiter/redis";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const stores = WINDOWS.map(() => new RedisStore({ client: redis }));
```

No other changes required: `keyGenerator`, `limit`, `handler`, and the chain logic stay the same.

### 4. Optional: Shared vs Per-Window Stores

You can use a single Redis instance for all windows (recommended) or one store per window. The key format `tenant:${orgId}:${window}` already keeps windows distinct.

---

## Schema Impact

**None.** The `rate_limit_events` and `rate_limit_alerts_sent` tables remain in PostgreSQL. Only the sliding-window counters move from memory to Redis.

---

## Rollback

If issues arise, revert to MemoryStore by restoring the original import and store creation. No database rollback is needed.
