import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { env } from "../env";

const getAuthBaseURL = () => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.endsWith(".localhost")
    ) {
      return window.location.origin.replace(/:\d+$/, ":8000");
    }
  }
  const apiUrl = env.VITE_API_URL;
  const baseUrl = apiUrl.replace(/\/+$/, "").replace(/\/api$/, "");
  return baseUrl;
};

export const authClient = createAuthClient({
  baseURL: getAuthBaseURL(),
  fetchOptions: {
    credentials: "include",
  },
  plugins: [organizationClient()],
});
