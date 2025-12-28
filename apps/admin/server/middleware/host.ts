import { defineEventHandler } from "h3";

export default defineEventHandler((event) => {
  if (!event.node?.req?.headers) return;

  const hostHeader =
    event.node.req.headers.host ||
    event.node.req.headers["x-forwarded-host"] ||
    event.node.req.headers["x-vercel-deployment-url"];

  if (hostHeader && process.env.NODE_ENV === "development") {
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
    if (host && typeof host === "string" && host.length > 0) {
      const hostname = host.split(":")[0]?.toLowerCase();
      if (hostname) {
        console.log("[Host Middleware] Accepting host:", hostname);
      }
    }
  }
});
