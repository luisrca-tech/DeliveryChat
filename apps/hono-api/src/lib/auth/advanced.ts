import type { env as envType } from "../../env.js";

function deriveCrossSubdomainCookieDomain(
  nodeEnv: string,
  betterAuthBaseUrl: string,
): string | undefined {
  try {
    const hostname = new URL(betterAuthBaseUrl).hostname.toLowerCase();

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    ) {
      return undefined;
    }

    if (nodeEnv === "production" && hostname.startsWith("api.")) {
      return `.${hostname.slice("api.".length)}`;
    }

    if (nodeEnv === "development" && hostname.startsWith("api-dev.")) {
      return `.${hostname}`;
    }

    return `.${hostname}`;
  } catch {
    return undefined;
  }
}

export function getAdvancedOptions(env: typeof envType, baseURL: string) {
  const domain = deriveCrossSubdomainCookieDomain(env.NODE_ENV, baseURL);

  return {
    cookiePrefix: "better-auth",
    ...(domain
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain,
          },
        }
      : {}),
  };
}
