import type { APIRoute } from "astro";
import { env } from "../../../env.js";
import {
  assertSafeDemoPath,
  getOrCreateVisitorSession,
  proxyDemoPublicApi,
} from "../../../lib/demo-proxy.js";

export const prerender = false;

function normalizePathParam(path: string | string[] | undefined): string {
  if (path === undefined) return "";
  return Array.isArray(path) ? path.join("/") : path;
}

export const ALL: APIRoute = async ({ request, params }) => {
  const path = normalizePathParam(params.path);
  if (!assertSafeDemoPath(path)) {
    return new Response(
      JSON.stringify({
        error: "bad_request",
        message: "Invalid or missing path",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const base = env.PUBLIC_API_URL;
  const apiKey = env.DEMO_CHAT_API_KEY;
  const appId = env.DEMO_CHAT_APP_ID;
  if (!base || !apiKey || !appId) {
    return new Response(
      JSON.stringify({
        error: "demo_unavailable",
        message: "Live demo is not configured.",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const { visitorId, setCookie } = getOrCreateVisitorSession(request);

  const proxied = await proxyDemoPublicApi(path, request, {
    baseUrl: base,
    apiKey,
    appId,
  }, visitorId);

  if (setCookie) {
    const headers = new Headers(proxied.headers);
    headers.append("Set-Cookie", setCookie);
    return new Response(proxied.body, {
      status: proxied.status,
      headers,
    });
  }

  return proxied;
};
