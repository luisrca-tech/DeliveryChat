import type { MiddlewareHandler } from "hono";
import { queryCounterStore, getQueryEntries } from "./queryCounterStore.js";

const DEFAULT_THRESHOLD = 15;

type QueryMonitorOptions = {
  threshold?: number;
  routeThresholds?: Record<string, number>;
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

function shouldEmitServerTiming(c: {
  req: { header: (name: string) => string | undefined };
  get: (key: string) => unknown;
}): boolean {
  if (process.env.NODE_ENV === "development") return true;

  const debugHeader = c.req.header("X-Debug-Timing");
  if (debugHeader !== "true") return false;

  const auth = c.get("auth") as
    | { membership?: { role?: string } }
    | undefined;
  return auth?.membership?.role === "super_admin";
}

function buildServerTimingHeader(
  totalDuration: number,
  queryCount: number,
): string {
  const entries = getQueryEntries();
  const parts: string[] = [
    `db;dur=${totalDuration};desc="${queryCount} queries"`,
  ];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const nextTimestamp = entries[i + 1]?.timestamp ?? performance.now();
    const dur = Math.round(nextTimestamp - entry.timestamp);
    parts.push(`db.q${i + 1};dur=${dur};desc="${entry.sql.slice(0, 80)}"`);
  }

  return parts.join(", ");
}

function logQueryBreakdown(
  method: string,
  path: string,
  level: "debug" | "warn",
): void {
  const entries = getQueryEntries();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const nextTimestamp = entries[i + 1]?.timestamp ?? performance.now();
    const dur = Math.round(nextTimestamp - entry.timestamp);
    const msg = `  [QUERY] q${i + 1} ~${dur}ms — ${entry.sql}`;
    if (level === "warn") {
      console.warn(msg);
    } else {
      console.debug(msg);
    }
  }
}

export function queryMonitorMiddleware(
  options?: QueryMonitorOptions,
): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.header("upgrade")?.toLowerCase() === "websocket") {
      await next();
      return;
    }

    const defaultThreshold = resolveThreshold(options);
    const routeThresholds = options?.routeThresholds;

    await queryCounterStore.run(
      { count: 0, startTime: performance.now(), queries: [] },
      async () => {
        await next();

        const store = queryCounterStore.getStore()!;
        const duration = Math.round(performance.now() - store.startTime);
        const method = c.req.method;
        const path = new URL(c.req.url).pathname;
        const routeKey = `${method} ${path}`;
        const threshold =
          routeThresholds?.[routeKey] ?? defaultThreshold;

        if (shouldEmitServerTiming(c)) {
          c.header(
            "Server-Timing",
            buildServerTimingHeader(duration, store.count),
          );
        }

        if (store.count > threshold) {
          console.warn(
            `[QUERY ALERT] ${method} ${path} — ${store.count} queries in ${duration}ms (threshold: ${threshold})`,
          );
          if (store.queries.length > 0) {
            logQueryBreakdown(method, path, "warn");
          }
        }

        if (process.env.NODE_ENV === "development") {
          console.debug(
            `[QUERY MONITOR] ${method} ${path} — ${store.count} queries in ${duration}ms`,
          );
          if (store.queries.length > 0) {
            logQueryBreakdown(method, path, "debug");
          }
        }
      },
    );
  };
}
