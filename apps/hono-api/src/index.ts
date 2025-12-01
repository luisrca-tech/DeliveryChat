import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { api } from "./lib/api.js";

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

// Mount API routes
app.route("/api", api);

export type AppType = typeof app;

const port = Number(process.env.PORT) || 8000;

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(
      `[Hono API] ✅ Server is running on http://localhost:${info.port}`
    );
    console.log(`[Hono API] Health check: http://localhost:${info.port}/`);
    console.log(
      `[Hono API] API endpoint: http://localhost:${info.port}/api/users`
    );
  }
).on("error", (error) => {
  console.error(`[Hono API] ❌ Failed to start server:`, error);
  process.exit(1);
});
