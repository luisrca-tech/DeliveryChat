import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

const adminDir = dirname(fileURLToPath(import.meta.url));

function faviconHrefWithMtime(): string {
  try {
    const p = resolve(adminDir, "public/favicon.ico");
    return `/favicon.ico?v=${String(statSync(p).mtimeMs)}`;
  } catch {
    return "/favicon.ico";
  }
}

const config = defineConfig({
  define: {
    "import.meta.env.VITE_FAVICON_HREF": JSON.stringify(
      faviconHrefWithMtime(),
    ),
  },
  plugins: [
    devtools({
      eventBusConfig: {
        enabled: false,
      },
    }),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    nitro(),
  ],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  envPrefix: ["VITE_", "PUBLIC_"],
});

export default config;
