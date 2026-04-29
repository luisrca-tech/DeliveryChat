import { describe, it, expect } from "vitest";
import { QueryCountingLogger } from "./queryLogger.js";
import {
  queryCounterStore,
  getQueryEntries,
} from "../lib/middleware/queryCounterStore.js";

describe("QueryCountingLogger", () => {
  const logger = new QueryCountingLogger();

  it("increments the counter inside an active AsyncLocalStorage context", () => {
    queryCounterStore.run({ count: 0, startTime: 0, queries: [] }, () => {
      logger.logQuery("SELECT * FROM users", []);
      logger.logQuery("SELECT * FROM members", []);

      const store = queryCounterStore.getStore()!;
      expect(store.count).toBe(2);
    });
  });

  it("does not throw when called outside AsyncLocalStorage context", () => {
    expect(() => logger.logQuery("SELECT 1", [])).not.toThrow();
  });

  it("does not increment counter outside AsyncLocalStorage context", () => {
    const storeBefore = queryCounterStore.getStore();
    logger.logQuery("SELECT 1", []);
    expect(storeBefore).toBeUndefined();
  });

  it("records query SQL text into the store entries", () => {
    queryCounterStore.run({ count: 0, startTime: 0, queries: [] }, () => {
      logger.logQuery("SELECT * FROM conversations WHERE org_id = $1", [
        "org-123",
      ]);

      const entries = getQueryEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]!.sql).toBe(
        "SELECT * FROM conversations WHERE org_id = $1",
      );
      expect(entries[0]!.timestamp).toBeTypeOf("number");
    });
  });

  it("records multiple queries in sequence with timestamps", () => {
    queryCounterStore.run({ count: 0, startTime: 0, queries: [] }, () => {
      logger.logQuery("SELECT * FROM conversations", []);
      logger.logQuery("SELECT COUNT(*) FROM messages", []);
      logger.logQuery("UPDATE conversations SET updated_at = now()", []);

      const entries = getQueryEntries();
      expect(entries).toHaveLength(3);

      const store = queryCounterStore.getStore()!;
      expect(store.count).toBe(3);
    });
  });
});
