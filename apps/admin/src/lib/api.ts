import type { APIType } from "hono-api/types";
import { hc } from "hono/client";
import { env } from "../env";

export const api = hc<APIType>(env.VITE_API_URL);
