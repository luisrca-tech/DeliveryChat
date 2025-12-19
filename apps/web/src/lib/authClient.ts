import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { env } from "../env";

const getBaseURL = () => {
  if (env.PUBLIC_BETTER_AUTH_URL) {
    return env.PUBLIC_BETTER_AUTH_URL.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    const apiUrl = env.PUBLIC_API_URL.replace(/\/+$/, "").replace(/\/api$/, "");
    const apiOrigin = new URL(apiUrl);
    return apiOrigin.origin;
  }

  return "http://localhost:8000";
};

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
  fetchOptions: {
    credentials: "include",
  },
  plugins: [organizationClient()],
});
