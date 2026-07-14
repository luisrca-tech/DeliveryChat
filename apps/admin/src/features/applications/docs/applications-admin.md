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
8. **AI toggles** (auto-respond + database tools): shown only when the org can actually act on them — an add-on-eligible plan (Premium/Enterprise) **with** `aiAddonActive`. Every other org sees `AiPlanLockedNotice` in this slot, whose copy is chosen by `resolveAiLock` (`features/ai/lib/aiPlanGates`): `free_plan` (the assistant is off entirely — subscribe), `upgrade_plan` (Basic: drafts work, but auto-respond and data tools need the add-on — upgrade to Premium/Enterprise), `addon_inactive` (Premium/Enterprise without the add-on, never bought or cancelled — purchase it from Billing). No dead switch is ever rendered.

## Error Handling

- **404**: Application not found — toast error, query cache invalidated.
- **409**: Domain already exists on create — toast "Domain already exists. Choose a different domain."
- **Role check**: Non-admin users are redirected to `/` in `beforeLoad`.

## Technical Decisions

- **API client**: Uses direct fetch with `getTenantHeaders()` (same pattern as api-keys). Custom error classes `ApplicationNotFoundError` and `ApplicationDomainConflictError`.
- **Delete warning**: Fetches `activeApiKeysCount` via `GET /applications/:id` when delete dialog opens. Displayed in confirmation text.
- **aiInterviewStatus on detail**: `GET /applications/:id` derives status from `applicationAiContext` (same as list) so the detail page can label/link the AI interview card. Frontend also defaults to `not_started` when the field is absent.
- **AI section gate**: There are two distinct plan gates and this section uses the narrower one. `planAllowsServing` (BASIC+) governs drafts and replies; `planAllowsAddon` (PREMIUM+) governs the add-on-only capabilities — auto-respond and SQL data tools. Both live in `features/ai/lib/aiPlanGates`, alongside `resolveAiLock`, which folds plan + `aiAddonActive` into the one lock state the UI renders. The detail page shows its toggles only when `resolveAiLock` returns `null`, because a Basic org can be served by the AI but can never buy the add-on (`POST /billing/ai-addon` answers `plan_not_eligible`) — gating on serving handed Basic two switches it had no way to activate, and gating on plan alone would have handed the same dead switches to a Premium org that cancelled the add-on. Authoring stays separate from both: every plan, Free included, may run the onboarding interview and keep its context.
- **API is the real gate**: `PATCH /applications/:id` rejects `aiAutoRespond: true` / `aiDbEnabled: true` with 403 `plan_not_eligible` on non-eligible plans (`requestsAddonCapability` + `addonEligiblePlan`). Hiding the toggles is UX; the API is what keeps a value the runtime would never honor out of the database. Switching a flag OFF is never gated, so a downgraded org can always clear stale values.
- **Data tools card**: stays visible for all plans; plans without the AI add-on land on `FeatureLockedCard` with a Billing CTA.
- **Shared formatRelative**: Moved to `@/lib/formatRelative` for reuse by api-keys and applications features.
- **useApplicationsQuery**: Canonical implementation lives in applications feature; api-keys re-exports for backward compatibility.
