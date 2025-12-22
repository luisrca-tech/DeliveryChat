import { customType } from "drizzle-orm/pg-core";

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
    return value;
  },
});
