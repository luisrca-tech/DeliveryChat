import { NitroConfig } from "nitro/types";

export default {
  runtimeConfig: {
    public: {
      apiUrl: process.env.VITE_API_URL,
    },
  },
} satisfies NitroConfig;
