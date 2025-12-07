import { NitroConfig } from "nitro/types";

export default {
  runtimeConfig: {
    // Private (server-only) env vars
    VITE_API_URL: process.env.VITE_API_URL,
    // Public (exposed to client) env vars
    public: {
      VITE_API_URL: process.env.VITE_API_URL,
    },
  },
} satisfies NitroConfig;
