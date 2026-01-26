import process from "node:process";

function normalizeOrigin(url) {
  return url.replace(/\/+$/, "");
}

const upstream = process.env.HONO_API_UPSTREAM
  ? normalizeOrigin(process.env.HONO_API_UPSTREAM)
  : "http://placeholder-upstream";

/** @type {import('@vercel/config').VercelConfig} */
export const config = {
  buildCommand: "bun run build",
  framework: null,
  installCommand: "bun install",
  rewrites: [
    { source: "/api/v1", destination: `${upstream}/v1` },
    { source: "/api/v1/:path*", destination: `${upstream}/v1/:path*` },
    { source: "/api/auth", destination: `${upstream}/api/auth` },
    { source: "/api/auth/:path*", destination: `${upstream}/api/auth/:path*` },
  ],
};
