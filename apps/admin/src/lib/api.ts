import type { APIType } from "hono-api/types";
import { hc } from "hono/client";
import { env } from "../env";

// Use PUBLIC_API_URL from environment, fallback to localhost for development
const apiUrl = env.PUBLIC_API_URL || "http://localhost:8000/api";

export const api = hc<APIType>(apiUrl);
