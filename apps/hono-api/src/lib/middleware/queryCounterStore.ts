import { AsyncLocalStorage } from "node:async_hooks";

const MAX_SQL_LENGTH = 200;

type QueryEntry = {
  sql: string;
  timestamp: number;
};

type QueryCounterContext = {
  count: number;
  startTime: number;
  queries: QueryEntry[];
};

export const queryCounterStore =
  new AsyncLocalStorage<QueryCounterContext>();

export function incrementQueryCount(): void {
  const store = queryCounterStore.getStore();
  if (store) {
    store.count++;
  }
}

export function recordQuery(sql: string): void {
  const store = queryCounterStore.getStore();
  if (!store) return;

  store.count++;
  store.queries.push({
    sql:
      sql.length > MAX_SQL_LENGTH
        ? sql.slice(0, MAX_SQL_LENGTH) + "..."
        : sql,
    timestamp: performance.now(),
  });
}

export function getQueryEntries(): QueryEntry[] {
  return queryCounterStore.getStore()?.queries ?? [];
}
