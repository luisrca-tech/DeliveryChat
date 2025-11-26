import type { AppType } from "@repo/types";
import { hc } from "hono/client";

export const api = hc<AppType>("http://localhost:8000");
