# API Keys Admin Feature

## Business Rules

- Only users with `admin` or `super_admin` role can access the API keys page.
- API keys are scoped per application. Users must select an application to view or create keys.
- Plan limits apply: FREE=3, BASIC=5, PREMIUM=10, ENTERPRISE=1000 keys per application.
- The full API key is shown only once at creation or regeneration. After that, only a masked prefix is displayed.
- Keys can be revoked (invalidated) or regenerated (old key invalidated, new key created and shown once).

## UI Flow

1. **Application selector**: User selects an application. If none exist, "Create an application first" is shown.
2. **Environment filter**: Toggle between All, Production (live), and Test to filter keys.
3. **Search**: Filter keys by name (client-side).
4. **Create**: Opens dialog with optional name, environment (live/test), and optional expiration. On success, KeyRevealDialog shows the full key with copy button.
5. **Regenerate**: Confirmation dialog with optional new name/expiration. On success, KeyRevealDialog shows the new key.
6. **Revoke**: Confirmation dialog. Key is invalidated immediately.

## Error Handling

- **404**: Application or key not found — toast error, query cache invalidated.
- **429**: Plan limit reached on create — toast "Plan limit reached. Upgrade to add more keys."
- **Role check**: Non-admin users are redirected to `/` in `beforeLoad`.

## Technical Decisions

- **API client**: Uses direct fetch with `getTenantHeaders()` (same pattern as billing). Custom error classes `ApiKeyNotFoundError` and `ApiKeyLimitError` for specific handling.
- **Keyboard shortcut**: `Ctrl+N` / `Cmd+N` opens Create dialog when an app is selected and under limit.
- **Loading state**: Skeleton rows with `animate-pulse` while keys are loading.
- **Empty state**: "No API keys yet" with prominent Create button.
