import type { APIType } from "hono-api/types";
import { hc } from "hono/client";
import { env } from "../env";

const baseUrl = env.PUBLIC_API_URL;

const apiUrl = baseUrl
  ? baseUrl.endsWith("/api")
    ? baseUrl
    : `${baseUrl.replace(/\/$/, "")}/api`
  : "http://localhost:8000/api";

export const api = hc<APIType>(apiUrl);
