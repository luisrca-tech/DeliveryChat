import type { env as envType } from "../../env.js";

export function getAdvancedOptions(env: typeof envType) {
  return {
    cookiePrefix: "better-auth",
    ...(env.NODE_ENV === "production" && {
      crossSubDomainCookies: {
        enabled: true,
        domain: ".deliverychat.com",
      },
    }),
  };
}
