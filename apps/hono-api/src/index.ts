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
        origin.startsWith("http://127.0.0.1:")
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

// Mount Better Auth routes
app.all("/api/auth/*", async (c) => {
  return auth.handler(c.req.raw);
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
