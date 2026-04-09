import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";

const root = fileURLToPath(new URL(".", import.meta.url));

function copyWidgetToPublic(): Plugin {
  return {
    name: "copy-widget-to-public",
    writeBundle() {
      const src = join(root, "dist-embed", "widget.iife.js");
      const dest = join(root, "public", "widget.js");
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      console.log("[embed] copied to public/widget.js");
    },
  };
}

export default defineConfig({
  envPrefix: "VITE_",
  plugins: [copyWidgetToPublic()],
  build: {
    lib: {
      entry: resolve(__dirname, "src/widget/index.ts"),
      name: "DeliveryChat",
      fileName: "widget",
      formats: ["iife"],
    },
    outDir: "dist-embed",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
