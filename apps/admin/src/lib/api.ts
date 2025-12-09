import type { APIType } from "hono-api/types";
import { hc } from "hono/client";
import { env } from "../env";

const logClientEnv = () => {
  if (typeof window === "undefined") return;

  const exposedEnv = {
    VITE_API_URL: env.VITE_API_URL,
    MODE: import.meta.env.MODE,
    DEV: import.meta.env.DEV,
    PROD: import.meta.env.PROD,
    BASE_URL: import.meta.env.BASE_URL,
  };

  console.info("[admin] Client env snapshot:", exposedEnv);
  if (!env.VITE_API_URL) {
    console.error("[admin] Missing VITE_API_URL; API client will fail.");
  }
};

logClientEnv();

export const api = hc<APIType>(env.VITE_API_URL);
