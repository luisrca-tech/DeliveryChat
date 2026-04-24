import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { join, resolve } from "node:path";
import { copyWidgetToPublic, emitSriArtifact } from "./embed-build/plugins";

const root = fileURLToPath(new URL(".", import.meta.url));
const outDir = join(root, "dist-embed");
const publicDir = join(root, "public");

export default defineConfig({
  envPrefix: "VITE_",
  plugins: [emitSriArtifact(outDir), copyWidgetToPublic(outDir, publicDir)],
  build: {
    lib: {
      entry: resolve(root, "src/widget/index.ts"),
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
