import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

const getBaseURL = () => {
  const betterAuthUrl = import.meta.env.PUBLIC_BETTER_AUTH_URL;
  if (betterAuthUrl) {
    return betterAuthUrl.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    const apiUrl = import.meta.env.PUBLIC_API_URL?.replace(/\/+$/, "").replace(
      /\/api$/,
      ""
    );
    if (apiUrl) {
      const apiOrigin = new URL(apiUrl);
      return apiOrigin.origin;
    }
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
