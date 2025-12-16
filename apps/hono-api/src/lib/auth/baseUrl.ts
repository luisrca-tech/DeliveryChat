import type { env as envType } from "../../env.js";

export function getAuthBaseURL(env: typeof envType) {
  return env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : env.BETTER_AUTH_URL;
}
