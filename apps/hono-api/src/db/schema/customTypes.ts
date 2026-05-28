import { customType } from "drizzle-orm/pg-core";

const hasTimezone = /[Zz]$|[+-]\d{2}:\d{2}$/;

function appendUtcSuffix(value: string): string {
  return hasTimezone.test(value) ? value : `${value}Z`;
}

export const timestampString = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return "timestamp";
  },
  toDriver(value: string | Date): string {
    if (value instanceof Date) return value.toISOString();
    return value as string;
  },
  fromDriver(value: string): string {
    return appendUtcSuffix(value);
  },
});

export const timestampStringNullable = customType<{
  data: string | null;
  driverData: string | null;
}>({
  dataType() {
    return "timestamp";
  },
  toDriver(value: string | null | Date): string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    return value as string;
  },
  fromDriver(value: string | null): string | null {
    if (value === null) return null;
    return appendUtcSuffix(value);
  },
});

export const emailVerifiedTimestamp = customType<{
  data: string | null;
  driverData: string | null;
}>({
  dataType() {
    return "timestamp";
  },
  toDriver(value: string | null | boolean | Date): string | null {
    if (value === false) return null;
    if (value === true) return new Date().toISOString();
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    return value as string;
  },
  fromDriver(value: string | null): string | null {
    if (value === null) return null;
    return appendUtcSuffix(value);
  },
});
