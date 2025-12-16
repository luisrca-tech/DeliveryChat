import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./lib/auth.js";
import { api } from "./lib/api.js";
import { env } from "./env.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        /^http:\/\/[a-z0-9-]+\.localhost:\d+$/.test(origin)
      ) {
        return origin;
      }
      if (
        origin === "https://deliverychat-dev.onrender.com" ||
        origin === "https://deliverychat-prod.onrender.com" ||
        /^https:\/\/[a-z0-9-]+\.deliverychat\.com$/.test(origin)
      ) {
        return origin;
      }
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.all("/api/auth/*", async (c) => {
  const url = new URL(c.req.url);
  const startedAt = Date.now();
  const method = c.req.method;
  const pathname = url.pathname;
  const origin = c.req.header("origin");
  const host = c.req.header("host");
  const contentType = c.req.header("content-type");
  const contentLength = c.req.header("content-length");
  const transferEncoding = c.req.header("transfer-encoding");

  const abortSignal = c.req.raw.signal;
  const onAbort = () => {
    console.error(
      `[Better Auth] Request aborted: ${method} ${pathname} (+${
        Date.now() - startedAt
      }ms)`
    );
  };
  abortSignal?.addEventListener?.("abort", onAbort, { once: true });

  try {
    console.info(
      `[Better Auth] -> ${method} ${pathname} (host=${host ?? "?"}, origin=${
        origin ?? "?"
      })`
    );

    // Debug: request metadata only (do NOT read body; it can hang some requests)
    if (method !== "GET" && method !== "HEAD") {
      console.info(`[Better Auth] req meta ${method} ${pathname}`, {
        contentType: contentType ?? null,
        contentLengthHeader: contentLength ?? null,
        transferEncoding: transferEncoding ?? null,
      });
    }

    const res = await auth.handler(c.req.raw);
    console.info(
      `[Better Auth] ${method} ${pathname} -> ${res.status} (+${
        Date.now() - startedAt
      }ms)`
    );
    return res;
  } catch (err) {
    console.error(
      `[Better Auth] ${method} ${pathname} threw (+${Date.now() - startedAt}ms)`,
      err
    );
    throw err;
  } finally {
    abortSignal?.removeEventListener?.("abort", onAbort);
  }
});

app.route("/api", api);

export type AppType = typeof app;

const port = Number(env.PORT) || 8000;

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.info(
      `[Hono API] ✅ Server is running on http://localhost:${info.port}`
    );
    console.info(`[Hono API] Health check: http://localhost:${info.port}/`);
    console.info(
      `[Hono API] API endpoint: http://localhost:${info.port}/api/users`
    );
  }
).on("error", (error) => {
  console.error(`[Hono API] ❌ Failed to start server:`, error);
  process.exit(1);
});
