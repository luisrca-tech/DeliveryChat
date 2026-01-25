import type { Readable } from "node:stream";
import type {
  ConnectNext,
  ConnectRequest,
  ConnectResponse,
} from "./connectTypes";

type CookieCapableHeaders = Headers & { getSetCookie?: () => string[] };

async function readBody(req: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function getSingleHeader(
  value: string | string[] | undefined,
): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function toUpstreamPath(url: string): string {
  if (url === "/api/v1" || url.startsWith("/api/v1/")) {
    return url.replace(/^\/api\/v1/, "/v1");
  }

  if (url === "/api/auth" || url.startsWith("/api/auth/")) {
    return url;
  }

  const stripped = url.replace(/^\/api/, "");
  return stripped === "" ? "/" : stripped;
}

function copyRequestHeaders(req: ConnectRequest): Headers {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers ?? {})) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(","));
  }
  return headers;
}

function copyResponseHeaders(upstream: Headers, res: ConnectResponse) {
  upstream.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "set-cookie") return;
    if (lower === "content-length") return;
    if (lower === "content-encoding") return;
    if (lower === "transfer-encoding") return;
    if (lower === "connection") return;
    if (lower === "keep-alive") return;
    res.setHeader(key, value);
  });
}

function forwardSetCookie(upstream: Headers, res: ConnectResponse) {
  const cookieHeaders =
    (upstream as CookieCapableHeaders).getSetCookie?.() ?? [];
  if (cookieHeaders.length > 0) {
    res.setHeader("set-cookie", cookieHeaders);
    return;
  }

  const single = upstream.get("set-cookie");
  if (single) res.setHeader("set-cookie", single);
}

export function apiProxyPlugin(options: { target: string }) {
  const target = options.target.replace(/\/+$/, "");

  return {
    name: "local-api-proxy",
    configureServer(
      server: unknown & {
        middlewares: {
          use: (
            fn: (
              req: ConnectRequest,
              res: ConnectResponse,
              next: ConnectNext,
            ) => void | Promise<void>,
          ) => void;
        };
      },
    ) {
      server.middlewares.use(
        async (
          req: ConnectRequest,
          res: ConnectResponse,
          next: ConnectNext,
        ) => {
          const url = req.url;
          if (!url || !url.startsWith("/api/")) return next();

          const originalHost = getSingleHeader(req.headers?.host);

          try {
            const upstreamUrl = new URL(toUpstreamPath(url), target);

            const headers = copyRequestHeaders(req);
            if (originalHost) headers.set("x-forwarded-host", originalHost);
            headers.set("x-forwarded-proto", "http");

            const method = (req.method || "GET").toUpperCase();
            const body =
              method === "GET" || method === "HEAD"
                ? undefined
                : await readBody(req);

            const upstreamRes = await fetch(upstreamUrl, {
              method,
              headers,
              body: (body as unknown as BodyInit) || undefined,
              redirect: "manual",
            });

            res.statusCode = upstreamRes.status;
            copyResponseHeaders(upstreamRes.headers, res);
            forwardSetCookie(upstreamRes.headers, res);

            const buf = Buffer.from(await upstreamRes.arrayBuffer());
            res.end(buf);
          } catch (error) {
            res.statusCode = 502;
            res.setHeader("content-type", "application/json");
            res.end(
              Buffer.from(
                JSON.stringify({
                  error: "Bad Gateway",
                  message:
                    error instanceof Error ? error.message : "Proxy failed",
                }),
              ),
            );
          }
        },
      );
    },
  };
}
