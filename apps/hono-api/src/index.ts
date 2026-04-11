import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
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

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new Hono();

const { injectWebSocket } = initWebSocket(app);

app.use("*", logger());

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
    exposeHeaders: ["set-auth-token", "set-auth-jwt"],
    credentials: true,
  }),
);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get("/widget.js", async (c) => {
  const widgetPath = resolve(__dirname, "../../../widget/dist-embed/widget.iife.js");
  try {
    const content = await readFile(widgetPath, "utf-8");
    return c.body(content, 200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    });
  } catch {
    return c.text("Widget not found. Run: cd apps/widget && bun run build:embed", 404);
  }
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
