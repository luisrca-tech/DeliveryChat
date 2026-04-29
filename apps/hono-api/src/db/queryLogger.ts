import type { Logger } from "drizzle-orm";
import { recordQuery } from "../lib/middleware/queryCounterStore.js";

export class QueryCountingLogger implements Logger {
  logQuery(query: string, _params: unknown[]): void {
    recordQuery(query);
  }
}
