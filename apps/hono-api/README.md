```
bun install
bun run dev
```

```
open http://localhost:3000
```

## Data model (multi-tenant)

- Tenant → Applications
  - Tenants carry plan/slug/settings.
  - Applications belong to a tenant, with slug + subdomain unique per tenant, settings/description.
- Users belong to tenants (no companies).
- Companies/users_companies were removed; filter data by `applicationId` in the UI/API.
