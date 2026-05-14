# URL Prefix Migration: `/v1` to `/api/v1`

## Summary

All API routes moved from `/v1/*` to `/api/v1/*`. Better Auth remains at `/api/auth/*` (unversioned).

## Route Map

| Before | After |
|--------|-------|
| `/v1/conversations/*` | `/api/v1/conversations/*` |
| `/v1/widget/*` | `/api/v1/widget/*` |
| `/v1/ws` | `/api/v1/ws` |
| `/v1/users/*` | `/api/v1/users/*` |
| `/v1/register` | `/api/v1/register` |
| `/api/auth/*` | `/api/auth/*` (unchanged) |

## Technical Details

### Mount Point

Routes are mounted in `index.ts`:

```typescript
app.route("/api/v1", api);
app.route("/api/v1", wsRoute);
```

### CORS

Widget CORS check updated to match the new prefix:

```typescript
if (c.req.path.startsWith("/api/v1/widget/")) {
  return origin ?? "*";
}
```

### Query Monitor

Route thresholds reference the full path including prefix:

```typescript
routeThresholds: {
  "POST /api/v1/register": 25,
}
```

### No Backward Compatibility

Old `/v1/*` paths return 404. No redirects or deprecation period.

## Client Impact (Completed in Phase 5)

- **Admin frontend**: `getApiBaseUrl()` in `urls.ts` now returns `${baseUrl}/api/v1`. WebSocket URL in `useWebSocket.ts` updated to `/api/v1/ws`.
- **Widget**: All API paths in `api.ts`, `ws.ts`, and `conversation.ts` updated from `/v1/` to `/api/v1/`.
- **E2E tests**: Updated to use `/api/v1/*` paths (done in Phase 4).
- **Admin test mocks**: Base URL mocks in `applications.client.test.ts` and `api-keys.client.test.ts` updated.

## Risks

- **Embed script requires rebuild and redeploy**: The IIFE build (`widget.iife.js`) bakes `VITE_API_BASE_URL` at build time, and API path segments (`/api/v1/widget/...`) are hardcoded in the widget source files. Any previously deployed embed scripts still reference `/v1/` paths and will 404. Customers using CDN-hosted scripts get the fix after rebuild; self-hosted embed scripts require manual update.
- **Widget hardcodes path segments**: The widget concatenates `apiBaseUrl + "/api/v1/widget/..."` in `api.ts`, `ws.ts`, and `conversation.ts`. The prefix is not configurable via env var — only the origin is. If a reverse proxy rewrites or strips the `/api` segment, widget API calls will fail.
- **Admin `getApiBaseUrl()` guard**: The function appends `/api/v1` unless the base URL already ends with `/api/v1`. If `VITE_API_URL` were set to end in `/v1` (the old prefix), the guard wouldn't match, producing `/v1/api/v1`. Unlikely in practice but matches the same class of bug the old `/v1` guard had.
- **No stale cache risk**: Clean cutover (404 on old paths, no redirects) means cached client responses pointing to `/v1/*` fail immediately rather than silently serving stale data.
- **`APIType` unaffected**: The exported Hono RPC type describes route shapes, not the mount prefix. The admin client just needs its `baseUrl` updated.
