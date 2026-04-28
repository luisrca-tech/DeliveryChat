import { AsyncLocalStorage } from "node:async_hooks";

type QueryCounterContext = {
  count: number;
  startTime: number;
};

export const queryCounterStore =
  new AsyncLocalStorage<QueryCounterContext>();

export function incrementQueryCount(): void {
  const store = queryCounterStore.getStore();
  if (store) {
    store.count++;
  }
}
