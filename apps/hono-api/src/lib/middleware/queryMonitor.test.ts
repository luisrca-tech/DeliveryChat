import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { queryMonitorMiddleware } from "./queryMonitor.js";
import { queryCounterStore, incrementQueryCount } from "./queryCounterStore.js";

describe("queryMonitor middleware", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    vi.restoreAllMocks();
  });

  it("initializes query counter to 0 for each request", async () => {
    let capturedCount: number | undefined;

    app.use("*", queryMonitorMiddleware());
    app.get("/test", (c) => {
      const store = queryCounterStore.getStore();
      capturedCount = store?.count;
      return c.text("ok");
    });

    await app.request("/test");
    expect(capturedCount).toBe(0);
  });

  it("tracks query count when incrementQueryCount is called", async () => {
    let capturedCount: number | undefined;

    app.use("*", queryMonitorMiddleware());
    app.get("/test", (c) => {
      incrementQueryCount();
      incrementQueryCount();
      incrementQueryCount();
      const store = queryCounterStore.getStore();
      capturedCount = store?.count;
      return c.text("ok");
    });

    await app.request("/test");
    expect(capturedCount).toBe(3);
  });

  it("emits console.warn when query count exceeds threshold", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    app.use("*", queryMonitorMiddleware({ threshold: 2 }));
    app.get("/test", (c) => {
      incrementQueryCount();
      incrementQueryCount();
      incrementQueryCount();
      return c.text("ok");
    });

    await app.request("/test");

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[QUERY ALERT]"),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("3 queries"),
    );
  });

  it("does not warn when query count is within threshold", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    app.use("*", queryMonitorMiddleware({ threshold: 15 }));
    app.get("/test", (c) => {
      incrementQueryCount();
      return c.text("ok");
    });

    await app.request("/test");
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("reads threshold from QUERY_COUNT_THRESHOLD env var", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.QUERY_COUNT_THRESHOLD = "2";

    app.use("*", queryMonitorMiddleware());
    app.get("/test", (c) => {
      incrementQueryCount();
      incrementQueryCount();
      incrementQueryCount();
      return c.text("ok");
    });

    await app.request("/test");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[QUERY ALERT]"),
    );

    delete process.env.QUERY_COUNT_THRESHOLD;
  });

  it("excludes WebSocket upgrade requests", async () => {
    let storeAccessed = false;

    app.use("*", queryMonitorMiddleware());
    app.get("/ws", (c) => {
      const store = queryCounterStore.getStore();
      storeAccessed = store !== undefined;
      return c.text("upgrade");
    });

    const req = new Request("http://localhost/ws", {
      headers: { Upgrade: "websocket" },
    });
    await app.request(req);
    expect(storeAccessed).toBe(false);
  });

  it("includes method and path in warning message", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    app.use("*", queryMonitorMiddleware({ threshold: 1 }));
    app.get("/v1/conversations", (c) => {
      incrementQueryCount();
      incrementQueryCount();
      return c.text("ok");
    });

    await app.request("/v1/conversations");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("GET /v1/conversations"),
    );
  });

  it("includes duration in warning message", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    app.use("*", queryMonitorMiddleware({ threshold: 1 }));
    app.get("/test", (c) => {
      incrementQueryCount();
      incrementQueryCount();
      return c.text("ok");
    });

    await app.request("/test");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/\d+ms/));
  });

  it("emits console.debug in development for all requests", async () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    app.use("*", queryMonitorMiddleware({ threshold: 100 }));
    app.get("/test", (c) => {
      incrementQueryCount();
      return c.text("ok");
    });

    await app.request("/test");
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining("1 queries"),
    );

    process.env.NODE_ENV = originalEnv;
  });

  it("isolates query counts between concurrent requests", async () => {
    const counts: number[] = [];

    app.use("*", queryMonitorMiddleware());
    app.get("/test", async (c) => {
      incrementQueryCount();
      await new Promise((r) => setTimeout(r, 10));
      incrementQueryCount();
      const store = queryCounterStore.getStore();
      counts.push(store!.count);
      return c.text("ok");
    });

    await Promise.all([app.request("/test"), app.request("/test")]);
    expect(counts).toEqual([2, 2]);
  });
});
