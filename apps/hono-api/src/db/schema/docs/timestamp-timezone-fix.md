# Timestamp Timezone Fix

## Problem

PostgreSQL `timestamp` (without time zone) columns return bare strings like `2025-01-15 14:30:00`. When the frontend parses these with `new Date()`, JavaScript assumes local time instead of UTC, causing timestamps to display incorrectly across different timezones.

## Solution

The `fromDriver` function in all three custom Drizzle timestamp types (`timestampString`, `timestampStringNullable`, `emailVerifiedTimestamp`) now appends `Z` to bare timestamp strings. This converts them into valid ISO-8601 UTC timestamps, so `new Date()` correctly interprets them as UTC and `toLocaleTimeString()` applies the user's local timezone.

## Guard against double-append

A regex check (`/[Zz]$|[+-]\d{2}:\d{2}$/`) prevents appending `Z` if the string already contains a timezone indicator (e.g., `Z`, `+03:00`, `-05:00`).

## Impact

All timestamp columns in the database go through these custom types, so every timestamp surfaced to the frontend is now a valid UTC ISO-8601 string. No frontend changes were required.
