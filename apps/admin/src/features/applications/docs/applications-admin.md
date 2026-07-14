# Applications Admin Feature

## Business Rules

- Only users with `admin` or `super_admin` role can access the applications page.
- Applications are scoped per organization (tenant). Each application has a domain that is **globally unique across all organizations** (once any org uses a domain, no other org can use it).
- Domain is immutable after creation to avoid breaking existing API keys.
- Deleting an application performs a soft delete (`deletedAt`) and cascades to revoke all active API keys for that application.
- Soft-deleted applications are excluded from list and detail queries.

## UI Flow

1. **List**: Table shows all applications with name, domain, description, and created date.
2. **Search**: Client-side filter by name, domain, or description.
3. **Create**: Dialog with name (required), domain (required, lowercase letters/numbers/hyphens), and optional description. Domain must be unique.
4. **Edit**: Dialog with domain read-only, name and description editable. Includes an "Allowed Domains" section for managing the origin allow-list.
5. **Allowed Domains**: Inline multi-entry input with add/remove actions. Each entry is validated against `DOMAIN_REGEX` (from `@repo/types`). Supports wildcard subdomains (`*.example.com`). Entries are lowercased, duplicates are rejected with inline feedback. The list is sent as `allowedOrigins: string[]` in the PATCH request.
6. **Delete**: Confirmation dialog shows active API key count. Warns "This will also revoke X active API keys" when applicable.
7. **Detail**: Configuration cards (AI interview action + Data tools). The AI interview card title is derived from `aiInterviewStatus` (`Configure AI` / `Continue interview` / `View AI context`). Detail API must return this field; the UI falls back to `not_started` if missing.
8. **AI toggles** (auto-respond + database tools): shown only when the org plan is Premium or Enterprise (`useAiAvailability().planAvailable`). Free/Basic orgs do not see this section. When the plan is eligible but the AI add-on is inactive, the toggles remain visible with a note that the add-on is required for them to take effect.

## Error Handling

- **404**: Application not found — toast error, query cache invalidated.
- **409**: Domain already exists on create — toast "Domain already exists. Choose a different domain."
- **Role check**: Non-admin users are redirected to `/` in `beforeLoad`.

## Technical Decisions

- **API client**: Uses direct fetch with `getTenantHeaders()` (same pattern as api-keys). Custom error classes `ApplicationNotFoundError` and `ApplicationDomainConflictError`.
- **Delete warning**: Fetches `activeApiKeysCount` via `GET /applications/:id` when delete dialog opens. Displayed in confirmation text.
- **aiInterviewStatus on detail**: `GET /applications/:id` derives status from `applicationAiContext` (same as list) so the detail page can label/link the AI interview card. Frontend also defaults to `not_started` when the field is absent.
- **AI section gate**: Detail page uses `planAvailable` from `useAiAvailability` (PREMIUM/ENTERPRISE only). The Data tools config card stays visible for all plans; Free/Basic users land on `FeatureLockedCard` with a Billing CTA.
- **Shared formatRelative**: Moved to `@/lib/formatRelative` for reuse by api-keys and applications features.
- **useApplicationsQuery**: Canonical implementation lives in applications feature; api-keys re-exports for backward compatibility.
