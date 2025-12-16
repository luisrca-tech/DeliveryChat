const devTrustedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:3002",
] as const;

const prodTrustedOrigins = [
  "https://deliverychat-dev.onrender.com",
  "https://deliverychat-prod.onrender.com",
  "https://*.deliverychat.com",
] as const;

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

    const base: string[] = [...devTrustedOrigins, ...prodTrustedOrigins];
    if (origin && isAllowedLocalhostOrigin(origin) && !base.includes(origin)) {
      base.push(origin);
    }

    return base;
  };
}
