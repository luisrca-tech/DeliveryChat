import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { env } from "../env";

const getAuthBaseURL = () => {
  if (env.VITE_BETTER_AUTH_URL) {
    return env.VITE_BETTER_AUTH_URL.replace(/\/+$/, "");
  }

  const apiUrl = env.VITE_API_URL.replace(/\/+$/, "").replace(/\/api$/, "");
  const apiOrigin = new URL(apiUrl);
  return apiOrigin.origin;
};

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  fetchOptions: {
    credentials: "include",
  },
  plugins: [organizationClient()],
});
