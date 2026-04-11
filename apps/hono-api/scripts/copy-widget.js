import { copyFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = resolve(__dirname, "../../widget/dist-embed/widget.iife.js");
const dest = resolve(__dirname, "../dist/widget.iife.js");

if (existsSync(src)) {
  copyFileSync(src, dest);
  console.log("[copy-widget] Copied widget.iife.js to dist/");
} else {
  console.warn("[copy-widget] widget.iife.js not found at", src);
  console.warn("[copy-widget] Run: cd apps/widget && bun run build:embed");
}
