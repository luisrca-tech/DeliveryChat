import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { queryMonitorMiddleware } from "./queryMonitor.js";
import { queryCounterStore, incrementQueryCount, recordQuery } from "./queryCounterStore.js";

describe("queryMonitor middleware", () => {
  let app: Hono;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    app = new Hono();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
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

  describe("Server-Timing header", () => {
    it("adds Server-Timing header when X-Debug-Timing is set and user is super_admin", async () => {
      app.use("*", queryMonitorMiddleware());
      app.get("/test", (c) => {
        c.set("auth" as never, {
          membership: { role: "super_admin" },
        } as never);
        recordQuery("SELECT * FROM conversations");
        recordQuery("SELECT * FROM messages");
        return c.text("ok");
      });

      const req = new Request("http://localhost/test", {
        headers: { "X-Debug-Timing": "true" },
      });
      const res = await app.request(req);

      const serverTiming = res.headers.get("Server-Timing");
      expect(serverTiming).not.toBeNull();
      expect(serverTiming).toMatch(/db;dur=\d+/);
      expect(serverTiming).toContain('desc="2 queries"');
    });

    it("does NOT add Server-Timing header without X-Debug-Timing header", async () => {
      app.use("*", queryMonitorMiddleware());
      app.get("/test", (c) => {
        c.set("auth" as never, {
          membership: { role: "super_admin" },
        } as never);
        recordQuery("SELECT 1");
        return c.text("ok");
      });

      const res = await app.request("/test");
      expect(res.headers.get("Server-Timing")).toBeNull();
    });

    it("does NOT add Server-Timing header when user is not super_admin", async () => {
      app.use("*", queryMonitorMiddleware());
      app.get("/test", (c) => {
        c.set("auth" as never, {
          membership: { role: "operator" },
        } as never);
        recordQuery("SELECT 1");
        return c.text("ok");
      });

      const req = new Request("http://localhost/test", {
        headers: { "X-Debug-Timing": "true" },
      });
      const res = await app.request(req);
      expect(res.headers.get("Server-Timing")).toBeNull();
    });

    it("does NOT add Server-Timing header when user is admin (not super_admin)", async () => {
      app.use("*", queryMonitorMiddleware());
      app.get("/test", (c) => {
        c.set("auth" as never, {
          membership: { role: "admin" },
        } as never);
        recordQuery("SELECT 1");
        return c.text("ok");
      });

      const req = new Request("http://localhost/test", {
        headers: { "X-Debug-Timing": "true" },
      });
      const res = await app.request(req);
      expect(res.headers.get("Server-Timing")).toBeNull();
    });

    it("does NOT add Server-Timing header when no auth context exists", async () => {
      app.use("*", queryMonitorMiddleware());
      app.get("/test", (c) => {
        recordQuery("SELECT 1");
        return c.text("ok");
      });

      const req = new Request("http://localhost/test", {
        headers: { "X-Debug-Timing": "true" },
      });
      const res = await app.request(req);
      expect(res.headers.get("Server-Timing")).toBeNull();
    });

    it("always adds Server-Timing header in development mode", async () => {
      process.env.NODE_ENV = "development";

      app.use("*", queryMonitorMiddleware());
      app.get("/test", (c) => {
        recordQuery("SELECT * FROM conversations");
        return c.text("ok");
      });

      const res = await app.request("/test");

      const serverTiming = res.headers.get("Server-Timing");
      expect(serverTiming).not.toBeNull();
      expect(serverTiming).toMatch(/db;dur=\d+/);
    });

    it("includes per-query breakdown in Server-Timing when queries are recorded", async () => {
      app.use("*", queryMonitorMiddleware());
      app.get("/test", (c) => {
        c.set("auth" as never, {
          membership: { role: "super_admin" },
        } as never);
        recordQuery("SELECT * FROM conversations");
        recordQuery("SELECT COUNT(*) FROM messages");
        return c.text("ok");
      });

      const req = new Request("http://localhost/test", {
        headers: { "X-Debug-Timing": "true" },
      });
      const res = await app.request(req);

      const serverTiming = res.headers.get("Server-Timing");
      expect(serverTiming).toContain("db.q1");
      expect(serverTiming).toContain("db.q2");
    });
  });

  describe("per-query logging", () => {
    it("logs individual query SQL in development mode", async () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      process.env.NODE_ENV = "development";

      app.use("*", queryMonitorMiddleware());
      app.get("/test", (c) => {
        recordQuery("SELECT * FROM conversations WHERE org_id = $1");
        return c.text("ok");
      });

      await app.request("/test");

      const queryLogCalls = debugSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("[QUERY]"),
      );
      expect(queryLogCalls).toHaveLength(1);
      expect(queryLogCalls[0][0]).toContain("SELECT * FROM conversations");
    });

    it("logs per-query breakdown when threshold is exceeded", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      process.env.NODE_ENV = "production";

      app.use("*", queryMonitorMiddleware({ threshold: 1 }));
      app.get("/test", (c) => {
        recordQuery("SELECT * FROM conversations");
        recordQuery("SELECT * FROM messages");
        return c.text("ok");
      });

      await app.request("/test");

      const queryLogCalls = warnSpy.mock.calls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("[QUERY]"),
      );
      expect(queryLogCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("does NOT log individual queries in production when within threshold", async () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      process.env.NODE_ENV = "production";

      app.use("*", queryMonitorMiddleware({ threshold: 15 }));
      app.get("/test", (c) => {
        recordQuery("SELECT 1");
        return c.text("ok");
      });

      await app.request("/test");

      const allCalls = [...debugSpy.mock.calls, ...warnSpy.mock.calls];
      const queryLogs = allCalls.filter(
        (call) => typeof call[0] === "string" && call[0].includes("[QUERY]"),
      );
      expect(queryLogs).toHaveLength(0);
    });
  });
});
