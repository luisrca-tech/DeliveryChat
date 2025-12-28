/**
 * CORS origin pattern matching utility
 *
 * Supports patterns from Infisical ALLOWED_ORIGINS:
 * - Wildcard subdomains: "https://*.vercel.app"
 * - Port wildcards: "http://localhost:*"
 * - Exact matches: "https://deliverychat.online"
 */

function hostnameMatches(hostname: string, pattern: string): boolean {
  if (pattern === hostname) return true;

  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return hostname.endsWith(suffix);
  }

  return false;
}

export function originMatchesPattern(origin: string, pattern: string): boolean {
  try {
    const url = new URL(origin);

    const [scheme, hostPattern] = pattern.split("://");
    if (!hostPattern) return false;

    if (scheme !== url.protocol.replace(":", "")) return false;

    if (hostPattern.includes(":")) {
      const [host, port] = hostPattern.split(":");
      if (!host) return false;
      if (port !== "*" && url.port !== port) return false;
      return hostnameMatches(url.hostname, host);
    }

    return hostnameMatches(url.hostname, hostPattern);
  } catch {
    return false;
  }
}

export function isOriginAllowed(
  origin: string | null,
  allowedPatterns: string[] | undefined
): boolean {
  if (!origin) return false;
  if (!allowedPatterns || allowedPatterns.length === 0) return false;

  for (const pattern of allowedPatterns) {
    if (originMatchesPattern(origin, pattern)) {
      return true;
    }
  }

  return false;
}
