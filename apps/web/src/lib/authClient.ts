import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

const getBaseURL = () => {
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:8000";
    }
    return window.location.origin.replace(/:\d+$/, ":8000");
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
