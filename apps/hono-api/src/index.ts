import "dotenv/config";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { auth } from "./lib/auth.js";
import { api } from "./lib/api.js";
import { env } from "./env.js";
import { isOriginAllowed } from "./lib/corsPatterns.js";
import { initWebSocket } from "./lib/ws.js";
import { wsRoute } from "./routes/ws.js";
import { queryMonitorMiddleware } from "./lib/middleware/queryMonitor.js";


const app = new Hono();

const { injectWebSocket } = initWebSocket(app);

app.use("*", logger());
app.use("*", queryMonitorMiddleware());

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      if (c.req.path.startsWith("/v1/widget/")) {
        return origin ?? "*";
      }

      if (!origin) return origin;

      if (
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        /^http:\/\/[a-z0-9-]+\.localhost:\d+$/.test(origin)
      ) {
        return origin;
      }

      if (isOriginAllowed(origin, env.ALLOWED_ORIGINS)) {
        return origin;
      }

      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: [
      "Content-Type",
      "Authorization",
      "X-Tenant-Slug",
      "X-Timezone",
      "X-App-Id",
      "X-Visitor-Id",
    ],
    exposeHeaders: ["set-auth-token", "set-auth-jwt", "Server-Timing"],
    credentials: true,
  }),
);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get("/widget.js", async (c) => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(__dirname, "widget.iife.js"),
    resolve(__dirname, "../../widget/dist-embed/widget.iife.js"),
  ];

  for (const widgetPath of candidates) {
    try {
      const content = await readFile(widgetPath, "utf-8");
      const cacheControl = env.NODE_ENV === "production"
        ? "public, max-age=3600"
        : "no-cache, no-store, must-revalidate";
      return c.body(content, 200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": cacheControl,
        "Access-Control-Allow-Origin": "*",
      });
    } catch {
      continue;
    }
  }
  return c.text("Widget not found. Run: cd apps/widget && bun run build:embed", 404);
});

app.get("/brand/logo.png", async (c) => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(__dirname, "../../assets/chat-widget.png"),
    resolve(__dirname, "../public/chat-widget.png"),
  ];
  for (const logoPath of candidates) {
    if (!existsSync(logoPath)) continue;
    try {
      const st = statSync(logoPath);
      const etag = `"${st.mtimeMs}-${st.size}"`;
      if (c.req.header("if-none-match") === etag) {
        const cacheControl =
          env.NODE_ENV === "production"
            ? "public, max-age=300, stale-while-revalidate=3600"
            : "public, max-age=0, must-revalidate";
        return c.body(null, 304, {
          "Cache-Control": cacheControl,
          ETag: etag,
          "Access-Control-Allow-Origin": "*",
        });
      }
      const buf = await readFile(logoPath);
      const cacheControl =
        env.NODE_ENV === "production"
          ? "public, max-age=300, stale-while-revalidate=3600"
          : "public, max-age=0, must-revalidate";
      return c.body(buf, 200, {
        "Content-Type": "image/png",
        "Cache-Control": cacheControl,
        ETag: etag,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "ETag",
      });
    } catch {
      continue;
    }
  }
  return c.text("Launcher image not found", 404);
});

app.get("/brand/chat.png", async (c) => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(__dirname, "../../widget/public/chat.png"),
    resolve(__dirname, "../public/chat.png"),
  ];
  for (const chatPath of candidates) {
    if (!existsSync(chatPath)) continue;
    try {
      const st = statSync(chatPath);
      const etag = `"${st.mtimeMs}-${st.size}"`;
      if (c.req.header("if-none-match") === etag) {
        const cacheControl =
          env.NODE_ENV === "production"
            ? "public, max-age=300, stale-while-revalidate=3600"
            : "public, max-age=0, must-revalidate";
        return c.body(null, 304, {
          "Cache-Control": cacheControl,
          ETag: etag,
          "Access-Control-Allow-Origin": "*",
        });
      }
      const buf = await readFile(chatPath);
      const cacheControl =
        env.NODE_ENV === "production"
          ? "public, max-age=300, stale-while-revalidate=3600"
          : "public, max-age=0, must-revalidate";
      return c.body(buf, 200, {
        "Content-Type": "image/png",
        "Cache-Control": cacheControl,
        ETag: etag,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "ETag",
      });
    } catch {
      continue;
    }
  }
  return c.text("Chat launcher image not found", 404);
});

app.all("/api/auth/*", async (c) => {
  return auth.handler(c.req.raw);
});

app.route("/v1", api);
app.route("/v1", wsRoute);

export type AppType = typeof app;

const port = Number(env.PORT) || 8000;

const server = serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(
      `[Hono API] Server running on http://localhost:${info.port}`,
    );
  },
);

injectWebSocket(server);
console.log("[Hono API] WebSocket support enabled");

server.on("error", (error) => {
  console.error(`[Hono API] Failed to start server:`, error);
  process.exit(1);
});
