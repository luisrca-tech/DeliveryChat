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
