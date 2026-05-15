# SDK Identity

## Usage

```typescript
// After init
await DeliveryChat.identify({
  name: "Jane Doe",
  email: "jane@example.com",
  externalId: "user-123",
  metadata: { plan: "premium", seats: 5 },
});
```

### With HMAC Verification

When the tenant has identity verification enabled, the `hmac` field is required along with `externalId`. The HMAC must be computed server-side as `HMAC-SHA256(secret, externalId)`.

```typescript
await DeliveryChat.identify({
  externalId: "user-123",
  hmac: computedHmacFromYourServer,
  name: "Jane Doe",
});
```

## Parameters

| Field        | Type                     | Required | Description                        |
|-------------|--------------------------|----------|------------------------------------|
| `name`       | `string`                 | No*      | Display name                       |
| `email`      | `string`                 | No*      | Email address                      |
| `externalId` | `string`                 | No*      | Your system's user ID              |
| `metadata`   | `Record<string, unknown>`| No*      | Arbitrary key-value data           |
| `hmac`       | `string`                 | No**     | HMAC-SHA256 signature              |

\* At least one of `name`, `email`, `externalId`, or `metadata` must be provided.
\** Required when the tenant has identity verification enabled.

## Return Value

Returns a `Promise<IdentityResult>` with the upserted identity record.

## Command Queue

`identify` is supported in the IIFE command queue, so it can be called before the SDK loads:

```html
<script>
  window.DeliveryChat = window.DeliveryChat || { queue: [] };
  window.DeliveryChat.queue.push(["identify", { name: "Jane", email: "jane@co.com" }]);
</script>
```

## Headless Mode

`identify()` works in both widget and headless modes. It requires `init()` to have been called first (throws if SDK is not initialized).

## Architecture

`SdkApi.identify()` delegates to `postIdentify()` in `api.ts`, the shared REST client used by all SDK→API interactions. This ensures identity calls benefit from the same URL normalization, header conventions, and error handling as `fetchSettings()` and `fetchWsToken()`, and are interceptable by the same mock infrastructure in tests.
