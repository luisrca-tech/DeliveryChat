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
  () => {}
).on("error", (error) => {
  console.error(`[Hono API] Failed to start server:`, error);
  process.exit(1);
});
