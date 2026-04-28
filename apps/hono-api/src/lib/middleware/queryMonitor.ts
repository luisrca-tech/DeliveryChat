import type { MiddlewareHandler } from "hono";
import { queryCounterStore } from "./queryCounterStore.js";

const DEFAULT_THRESHOLD = 15;

type QueryMonitorOptions = {
  threshold?: number;
};

function resolveThreshold(options?: QueryMonitorOptions): number {
  if (options?.threshold !== undefined) return options.threshold;
  const envValue = process.env.QUERY_COUNT_THRESHOLD;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return DEFAULT_THRESHOLD;
}

export function queryMonitorMiddleware(
  options?: QueryMonitorOptions,
): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.header("upgrade")?.toLowerCase() === "websocket") {
      await next();
      return;
    }

    const threshold = resolveThreshold(options);

    await queryCounterStore.run(
      { count: 0, startTime: performance.now() },
      async () => {
        await next();

        const store = queryCounterStore.getStore()!;
        const duration = Math.round(performance.now() - store.startTime);
        const method = c.req.method;
        const path = new URL(c.req.url).pathname;

        if (store.count > threshold) {
          console.warn(
            `[QUERY ALERT] ${method} ${path} — ${store.count} queries in ${duration}ms (threshold: ${threshold})`,
          );
        }

        if (process.env.NODE_ENV === "development") {
          console.debug(
            `[QUERY MONITOR] ${method} ${path} — ${store.count} queries in ${duration}ms`,
          );
        }
      },
    );
  };
}
