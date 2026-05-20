import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    env: {
      SKIP_ENV_VALIDATION: "true",
    },
  },
});
