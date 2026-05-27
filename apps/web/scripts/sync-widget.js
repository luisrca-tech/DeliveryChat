import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const widgetRoot = join(webRoot, "..", "widget");
const dest = join(webRoot, "public", "widget.js");

const sources = [
  join(widgetRoot, "public", "widget.js"),
  join(widgetRoot, "dist-embed", "widget.iife.js"),
];

function copyFrom(src) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  console.log(`[web] synced widget.js from ${src}`);
}

for (const src of sources) {
  if (existsSync(src)) {
    copyFrom(src);
    process.exit(0);
  }
}

console.log("[web] widget bundle missing — building embed…");
const build = spawnSync("bun", ["run", "build:embed"], {
  cwd: widgetRoot,
  stdio: "inherit",
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

for (const src of sources) {
  if (existsSync(src)) {
    copyFrom(src);
    process.exit(0);
  }
}

console.error(
  "[web] widget.js not found after build. Run: cd apps/widget && bun run build:embed",
);
process.exit(1);
