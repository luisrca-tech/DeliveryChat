import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const widgetDir = dirname(fileURLToPath(import.meta.url));

function faviconHrefWithMtime(): string {
  try {
    const p = resolve(widgetDir, "public/favicon.ico");
    return `/favicon.ico?v=${String(statSync(p).mtimeMs)}`;
  } catch {
    return "/favicon.ico";
  }
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_FAVICON_HREF": JSON.stringify(
      faviconHrefWithMtime(),
    ),
  },
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  server: {
    port: 3002,
  },
});
