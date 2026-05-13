export const DEMO_VISITOR_COOKIE = "dc_demo_vid";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAFE_PATH_RE = /^[a-zA-Z0-9/_-]+$/;

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function getOrCreateVisitorSession(request: Request): {
  visitorId: string;
  setCookie: string | null;
} {
  const raw = parseCookies(request.headers.get("cookie"))[DEMO_VISITOR_COOKIE];
  if (raw && UUID_RE.test(raw)) {
    return { visitorId: raw, setCookie: null };
  }
  const visitorId = crypto.randomUUID();
  const secure = process.env.NODE_ENV === "production";
  const cookie = [
    `${DEMO_VISITOR_COOKIE}=${visitorId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
  return { visitorId, setCookie: cookie };
}

type SafeErrorBody = { error: string; message?: string };

export function sanitizeUpstreamResponse(
  status: number,
  contentType: string | null,
  bodyText: string,
): { status: number; body: string } {
  if (status < 400) {
    return { status, body: bodyText };
  }
  const isJson = contentType?.includes("application/json");
  if (isJson) {
    try {
      const parsed = JSON.parse(bodyText) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "error" in parsed &&
        typeof (parsed as SafeErrorBody).error === "string"
      ) {
        const err = parsed as SafeErrorBody & Record<string, unknown>;
        const safe: SafeErrorBody = {
          error: err.error,
          ...(typeof err.message === "string" ? { message: err.message } : {}),
        };
        return { status, body: JSON.stringify(safe) };
      }
    } catch {
      /* fall through */
    }
  }
  const fallback: SafeErrorBody = {
    error: "upstream_error",
    message: "Request could not be completed. Try again later.",
  };
  return { status, body: JSON.stringify(fallback) };
}

export function assertSafeDemoPath(path: string): boolean {
  return path.length > 0 && SAFE_PATH_RE.test(path) && !path.includes("..");
}

export async function proxyDemoPublicApi(
  path: string,
  request: Request,
  config: { baseUrl: string; apiKey: string; appId: string },
  visitorId: string,
): Promise<Response> {
  const url = new URL(`/v1/api/${path}`, config.baseUrl);
  const reqUrl = new URL(request.url);
  url.search = reqUrl.search;

  const headers = new Headers();
  headers.set("Authorization", `Bearer ${config.apiKey}`);
  headers.set("X-App-Id", config.appId);
  headers.set("X-Visitor-Id", visitorId);

  const origin =
    request.headers.get("Origin") ?? new URL(request.url).origin;
  headers.set("Origin", origin);

  const accept = request.headers.get("Accept");
  if (accept) {
    headers.set("Accept", accept);
  }
  const ct = request.headers.get("Content-Type");
  if (ct) {
    headers.set("Content-Type", ct);
  }

  const method = request.method;
  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = await request.arrayBuffer();
  }

  const upstream = await fetch(url.toString(), {
    method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
  });

  const text = await upstream.text();
  const { status, body: safeBody } = sanitizeUpstreamResponse(
    upstream.status,
    upstream.headers.get("content-type"),
    text,
  );

  const outHeaders = new Headers();
  const uct = upstream.headers.get("content-type");
  if (uct) {
    outHeaders.set("Content-Type", uct);
  } else {
    outHeaders.set("Content-Type", "application/json");
  }

  return new Response(safeBody, { status, headers: outHeaders });
}
