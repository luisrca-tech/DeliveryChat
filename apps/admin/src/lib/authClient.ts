import { createAuthClient } from "better-auth/react";
import { organizationClient, emailOTPClient } from "better-auth/client/plugins";
import { getSubdomain } from "./subdomain.js";
import { getApiUrl } from "./urls.js";

export const authClient = createAuthClient({
  baseURL: getApiUrl(),
  fetchOptions: {
    credentials: "include",
    headers: (() => {
      const tenant = typeof window !== "undefined" ? getSubdomain() : null;
      return tenant ? { "X-Tenant-Slug": tenant } : undefined;
    })(),
  },
  plugins: [organizationClient(), emailOTPClient()],
});
