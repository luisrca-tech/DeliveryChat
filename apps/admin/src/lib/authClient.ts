import { createAuthClient } from "better-auth/react";
import { organizationClient, emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  fetchOptions: {
    credentials: "include",
  },
  plugins: [organizationClient(), emailOTPClient()],
});
