import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { resolve } from "path";
import { formatSriArtifact } from "./scripts/compute-sri";

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

function emitSriArtifact(): Plugin {
  return {
    name: "emit-sri-artifact",
    writeBundle() {
      const bundlePath = join(root, "dist-embed", "widget.iife.js");
      const artifactPath = join(root, "dist-embed", "widget.iife.js.sri.json");
      const content = readFileSync(bundlePath);
      const artifact = formatSriArtifact({
        file: "widget.iife.js",
        content,
      });
      writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`);
      console.log(`[embed] emitted SRI artifact: ${artifact.integrity}`);
    },
  };
}

export default defineConfig({
  envPrefix: "VITE_",
  plugins: [emitSriArtifact(), copyWidgetToPublic()],
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
