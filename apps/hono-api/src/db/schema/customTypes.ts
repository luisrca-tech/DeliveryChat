import { customType } from "drizzle-orm/pg-core";

// Custom timestamp column that converts Date objects to ISO strings (Better Auth passes Date objects)
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
    return value;
  },
});

// Custom nullable timestamp column that converts Date objects to ISO strings or null
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
    return value;
  },
});

// Custom timestamp column that converts false to null (Better Auth passes false for unverified emails)
export const emailVerifiedTimestamp = customType<{
  data: string | null;
  driverData: string | null;
}>({
  dataType() {
    return "timestamp";
  },
  toDriver(value: string | null | boolean | Date): string | null {
    if (value === false) return null;
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    return value as string;
  },
  fromDriver(value: string | null): string | null {
    return value;
  },
});
