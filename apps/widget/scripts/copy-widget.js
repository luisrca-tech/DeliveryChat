import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const src = join(root, "dist-embed", "widget.iife.js");
const dest = join(root, "public", "widget.js");

if (!existsSync(src)) {
  console.error("Run 'bun run build:embed' first");
  process.exit(1);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log("Copied widget to public/widget.js");
