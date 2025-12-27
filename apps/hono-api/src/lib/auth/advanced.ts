import type { env as envType } from "../../env.js";

export function getAdvancedOptions(env: typeof envType) {
  return {
    cookiePrefix: "better-auth",
    ...(env.NODE_ENV === "production" &&
      env.TENANT_DOMAIN && {
        crossSubDomainCookies: {
          enabled: true,
          domain: `.${env.TENANT_DOMAIN}`,
        },
      }),
  };
}
