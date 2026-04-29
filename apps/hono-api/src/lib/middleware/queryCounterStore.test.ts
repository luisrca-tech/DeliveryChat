import { describe, it, expect } from "vitest";
import { queryCounterStore, incrementQueryCount, recordQuery, getQueryEntries } from "./queryCounterStore.js";

describe("queryCounterStore", () => {
  describe("recordQuery", () => {
    it("stores query SQL and timestamp in the entries array", () => {
      queryCounterStore.run(
        { count: 0, startTime: 0, queries: [] },
        () => {
          recordQuery("SELECT * FROM users WHERE id = $1");

          const entries = getQueryEntries();
          expect(entries).toHaveLength(1);
          expect(entries[0]!.sql).toBe("SELECT * FROM users WHERE id = $1");
          expect(entries[0]!.timestamp).toBeTypeOf("number");
        },
      );
    });

    it("truncates SQL longer than 200 characters", () => {
      queryCounterStore.run(
        { count: 0, startTime: 0, queries: [] },
        () => {
          const longSql = "SELECT " + "a".repeat(300) + " FROM users";
          recordQuery(longSql);

          const entries = getQueryEntries();
          expect(entries[0]!.sql.length).toBeLessThanOrEqual(203); // 200 + "..."
          expect(entries[0]!.sql).toMatch(/\.\.\.$/);
        },
      );
    });

    it("also increments the query count", () => {
      queryCounterStore.run(
        { count: 0, startTime: 0, queries: [] },
        () => {
          recordQuery("SELECT 1");
          recordQuery("SELECT 2");

          const store = queryCounterStore.getStore()!;
          expect(store.count).toBe(2);
        },
      );
    });

    it("records multiple queries in order", () => {
      queryCounterStore.run(
        { count: 0, startTime: 0, queries: [] },
        () => {
          recordQuery("SELECT * FROM conversations");
          recordQuery("SELECT * FROM messages");
          recordQuery("UPDATE conversations SET updated_at = now()");

          const entries = getQueryEntries();
          expect(entries).toHaveLength(3);
          expect(entries[0]!.sql).toContain("conversations");
          expect(entries[1]!.sql).toContain("messages");
          expect(entries[2]!.sql).toContain("UPDATE");
        },
      );
    });

    it("does not throw when called outside AsyncLocalStorage context", () => {
      expect(() => recordQuery("SELECT 1")).not.toThrow();
    });

    it("records monotonically increasing timestamps", () => {
      queryCounterStore.run(
        { count: 0, startTime: 0, queries: [] },
        () => {
          recordQuery("SELECT 1");
          recordQuery("SELECT 2");

          const entries = getQueryEntries();
          expect(entries[1]!.timestamp).toBeGreaterThanOrEqual(entries[0]!.timestamp);
        },
      );
    });
  });

  describe("getQueryEntries", () => {
    it("returns empty array outside AsyncLocalStorage context", () => {
      expect(getQueryEntries()).toEqual([]);
    });

    it("returns the queries from the current store", () => {
      queryCounterStore.run(
        { count: 0, startTime: 0, queries: [] },
        () => {
          recordQuery("SELECT 1");
          const entries = getQueryEntries();
          expect(entries).toHaveLength(1);
        },
      );
    });
  });

  describe("incrementQueryCount (backward compat)", () => {
    it("still increments count without recording a query entry", () => {
      queryCounterStore.run(
        { count: 0, startTime: 0, queries: [] },
        () => {
          incrementQueryCount();

          const store = queryCounterStore.getStore()!;
          expect(store.count).toBe(1);
          expect(store.queries).toHaveLength(0);
        },
      );
    });
  });
});
