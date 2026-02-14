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
      const tenant = typeof window !== "undefined" ? getSubdomain() : null;
      return tenant ? { "X-Tenant-Slug": tenant } : undefined;
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
