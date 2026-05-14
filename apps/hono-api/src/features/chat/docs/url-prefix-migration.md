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

## Client Impact

- **Admin frontend**: Must update RPC base URL to `/api/v1` (Phase 5).
- **Widget**: Must update API base URL references (Phase 5).
- **E2E tests**: Updated to use `/api/v1/*` paths.

## Risks

- **Admin + widget broken until Phase 5**: Both clients still reference `/v1/` paths. All API calls will 404 until their base URLs are updated. This is expected — the apps are not deployed independently from the API.
- **Embed script requires rebuild**: The IIFE build (`widget.iife.js`) bakes in the API base URL at build time. Existing deployed embed scripts will fail until rebuilt with the new prefix.
- **No stale cache risk**: Clean cutover (404 on old paths, no redirects) means cached client responses pointing to `/v1/*` fail immediately rather than silently serving stale data.
- **`APIType` unaffected**: The exported Hono RPC type describes route shapes, not the mount prefix. The admin client just needs its `baseUrl` updated.
