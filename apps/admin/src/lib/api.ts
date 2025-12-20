import type { APIType } from "hono-api/types";
import { hc } from "hono/client";
import { getApiBaseUrl } from "./urls.js";

export const api = hc<APIType>(getApiBaseUrl());
