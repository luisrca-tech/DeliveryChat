import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  envPrefix: "VITE_",
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
