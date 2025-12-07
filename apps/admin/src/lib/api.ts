import type { APIType } from "hono-api/types";
import { hc } from "hono/client";

const baseUrl = import.meta.env.PUBLIC_API_URL;

console.log("baseUrl", baseUrl);
const apiUrl = baseUrl
  ? baseUrl.endsWith("/api")
    ? baseUrl
    : `${baseUrl.replace(/\/$/, "")}/api`
  : "http://localhost:8000/api";

export const api = hc<APIType>(apiUrl);
