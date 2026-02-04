import { getHostSubdomain } from "./tenant.js";

function safeUrlHost(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export function getUiHostFromHeaders(headers: Headers): string | null {
  const originHost = safeUrlHost(headers.get("origin"));
  if (originHost) return originHost;

  const refererHost = safeUrlHost(headers.get("referer"));
  if (refererHost) return refererHost;

  const forwarded = headers.get("x-forwarded-host");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;

  return headers.get("host");
}

export function getTenantSlugFromHeaders(headers: Headers): string | null {
  const uiHost = getUiHostFromHeaders(headers);
  return getHostSubdomain(uiHost);
}

export function getUiOriginFromHeaders(headers: Headers): string | null {
  const origin = headers.get("origin");
  if (origin) return origin;

  const referer = headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      return url.origin;
    } catch {
      return null;
    }
  }

  return null;
}
