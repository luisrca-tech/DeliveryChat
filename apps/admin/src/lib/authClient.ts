import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { env } from "../env";

const getAuthBaseURL = () => {
  const apiUrl = env.VITE_API_URL.replace(/\/+$/, "").replace(/\/api$/, "");
  const apiOrigin = new URL(apiUrl);

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".localhost")
    ) {
      const port = apiOrigin.port
        ? `:${apiOrigin.port}`
        : apiOrigin.protocol === "https:"
          ? ""
          : ":8000";
      return `${apiOrigin.protocol}//${hostname}${port}`;
    }
  }

  return apiOrigin.origin;
};

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  fetchOptions: {
    credentials: "include",
  },
  plugins: [organizationClient()],
});
