# AI Usage Page

## Overview

Admin-only page at `/settings/ai-usage` displaying AI assistant usage logs for the organization. Accessible to `admin` and `super_admin` roles only — operators are redirected away.

## Features

- **Summary cards:** Total requests, success rate (current page), and average latency (current page).
- **Filters:** Action type, status, operator, and date range (from/to).
- **Paginated table:** Shows timestamp, operator name, action, status (color-coded pill), model, token counts (input/output), and latency.
- **Pagination:** 20 items per page with previous/next navigation.

## Visibility

- The page is only visible in the Settings index for PREMIUM/ENTERPRISE tenants (gated by `useAiAvailability`).
- Route-level access is gated by `useRequireRole(["admin", "super_admin"])`.

## Key Decisions

- Summary cards compute from the current page only (not global aggregates) to avoid an extra backend query. The "Total Requests" card uses the paginated total count.
- `keepPreviousData` is used for the query to avoid layout flicker when changing pages or filters.
- Members are fetched to populate the operator filter dropdown.
