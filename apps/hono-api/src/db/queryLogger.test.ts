import { describe, it, expect, vi } from "vitest";
import { QueryCountingLogger } from "./queryLogger.js";
import { queryCounterStore } from "../lib/middleware/queryCounterStore.js";

describe("QueryCountingLogger", () => {
  const logger = new QueryCountingLogger();

  it("increments the counter inside an active AsyncLocalStorage context", () => {
    queryCounterStore.run({ count: 0, startTime: 0 }, () => {
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
});
