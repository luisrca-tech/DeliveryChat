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

  if (!options.allowedOrigins) return false;

  for (const entry of options.allowedOrigins) {
    if (matchesEntry(host, entry)) return true;
  }
  return false;
}

export type OriginEnforceInput = {
  origin: string | null | undefined;
  allowedOrigins: string[];
  keyEnvironment?: "live" | "test";
  requireOrigin?: boolean;
};

export type OriginEnforceResult =
  | { allowed: true }
  | { allowed: false; error: string; message: string };

export function enforceOrigin(input: OriginEnforceInput): OriginEnforceResult {
  const { origin, allowedOrigins, keyEnvironment, requireOrigin = false } =
    input;

  if (!origin) {
    if (requireOrigin) {
      return {
        allowed: false,
        error: "origin_not_allowed",
        message: "Origin header is required",
      };
    }
    return { allowed: true };
  }

  const testMode = keyEnvironment
    ? keyEnvironment === "test"
    : process.env.NODE_ENV !== "production";

  const allowed = matchesAllowedOrigin(origin, { allowedOrigins, testMode });

  if (!allowed) {
    return {
      allowed: false,
      error: "origin_not_allowed",
      message: "Origin is not in the application allow-list",
    };
  }

  return { allowed: true };
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
