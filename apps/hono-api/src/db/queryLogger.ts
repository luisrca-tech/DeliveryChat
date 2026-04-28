import type { Logger } from "drizzle-orm";
import { incrementQueryCount } from "../lib/middleware/queryCounterStore.js";

export class QueryCountingLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    incrementQueryCount();
  }
}
