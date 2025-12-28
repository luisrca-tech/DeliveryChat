import { env } from "../../env";
import { isOriginAllowed } from "../corsPatterns.js";

const devTrustedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
] as const;

export const allowedOrigins = env.ALLOWED_ORIGINS;

function isAllowedLocalhostOrigin(origin: string) {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:") return false;
    if (
      !(url.hostname === "localhost" || url.hostname.endsWith(".localhost"))
    ) {
      return false;
    }
    return ["3000", "3001", "3002"].includes(url.port);
  } catch {
    return false;
  }
}

export function createTrustedOrigins() {
  return (request: Request): string[] => {
    const origin = request.headers.get("origin");

    const base: string[] = [...devTrustedOrigins];

    if (origin && isAllowedLocalhostOrigin(origin) && !base.includes(origin)) {
      base.push(origin);
    }

    if (origin && isOriginAllowed(origin, allowedOrigins)) {
      if (!base.includes(origin)) {
        base.push(origin);
      }
    }

    return base;
  };
}
