import type { APIType } from "@repo/types";
import { hc } from "hono/client";

export const api = hc<APIType>("http://localhost:8000/api");
