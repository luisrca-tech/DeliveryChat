import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { apiProxyPlugin } from "./vite/apiProxy";

const config = defineConfig({
  plugins: [
    apiProxyPlugin({
      target:
        process.env.VITE_API_URL?.replace(/\/+$/, "") || "http://localhost:8000",
    }),
    devtools(),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    nitro(),
  ],
  envPrefix: ["VITE_", "PUBLIC_"],
});

export default config;
