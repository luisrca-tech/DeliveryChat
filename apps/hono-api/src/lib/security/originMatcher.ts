export type OriginMatchOptions = {
  allowedOrigins: string[];
  testMode: boolean;
};

export function matchesAllowedOrigin(
  origin: string | null | undefined,
  options: OriginMatchOptions,
): boolean {
  if (!origin) return false;

  const host = parseHost(origin);
  if (!host) return false;

  if (options.testMode && isLocalhostHost(host)) return true;

  for (const entry of options.allowedOrigins) {
    if (matchesEntry(host, entry)) return true;
  }
  return false;
}

function parseHost(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLocalhostHost(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost");
}

function matchesEntry(host: string, entry: string): boolean {
  const normalized = entry.trim().toLowerCase();
  if (!normalized) return false;

  if (normalized.startsWith("*.")) {
    const base = normalized.slice(2);
    return host === base || host.endsWith("." + base);
  }

  const apex = stripWwwPrefix(normalized);
  const hostApex = stripWwwPrefix(host);
  return host === normalized || hostApex === apex;
}

function stripWwwPrefix(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}
