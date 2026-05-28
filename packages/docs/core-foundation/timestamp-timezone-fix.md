# Timestamp Timezone Fix

## Problem

PostgreSQL `timestamp` (without time zone) columns return bare strings like `2025-01-15 14:30:00`. JavaScript's `new Date()` interprets these as local time rather than UTC, causing timestamps to display incorrectly across timezones.

## Solution

All three custom Drizzle timestamp types in `apps/hono-api/src/db/schema/customTypes.ts` now append `Z` to bare timestamp strings in their `fromDriver` function. A regex guard prevents double-appending when the string already contains a timezone indicator.

## Affected types

- `timestampString` — non-nullable timestamp
- `timestampStringNullable` — nullable timestamp
- `emailVerifiedTimestamp` — nullable timestamp used by Better Auth

## Impact

Every timestamp column in the database flows through these custom types. The fix ensures all frontend consumers receive valid UTC ISO-8601 strings without any frontend code changes.
