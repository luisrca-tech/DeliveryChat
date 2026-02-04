import { createAuthClient } from "better-auth/react";
import { organizationClient, emailOTPClient } from "better-auth/client/plugins";
import { getApiUrl } from "./urls.js";

export const authClient = createAuthClient({
  baseURL: getApiUrl(),
  fetchOptions: {
    credentials: "include",
  },
  plugins: [organizationClient(), emailOTPClient()],
});
