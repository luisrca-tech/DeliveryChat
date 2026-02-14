import { createAuthClient } from "better-auth/react";
import { organizationClient, emailOTPClient } from "better-auth/client/plugins";
import { getBearerToken, setBearerToken } from "./bearerToken.js";
import { getSubdomain } from "./subdomain.js";
import { getApiUrl } from "./urls.js";

export const authClient = createAuthClient({
  baseURL: getApiUrl(),
  fetchOptions: {
    auth: {
      type: "Bearer",
      token: () => getBearerToken() || "",
    },
    headers: (() => {
      if (typeof window === "undefined") return undefined;
      const headers: Record<string, string> = {};
      const tenant = getSubdomain();
      if (tenant) headers["X-Tenant-Slug"] = tenant;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (timezone) headers["X-Timezone"] = timezone;
      return Object.keys(headers).length > 0 ? headers : undefined;
    })(),
    onSuccess: (ctx: { response: Response }) => {
      const authToken = ctx.response.headers.get("set-auth-token");
      if (authToken) {
        setBearerToken(authToken);
      }
    },
  },
  plugins: [organizationClient(), emailOTPClient()],
});
