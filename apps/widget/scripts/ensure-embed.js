import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const iife = join(root, "dist-embed", "widget.iife.js");
const pub = join(root, "public", "widget.js");

if (existsSync(iife) && existsSync(pub)) {
  process.exit(0);
}

const build = spawnSync("bun", ["run", "build:embed"], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const copy = spawnSync("node", ["scripts/copy-widget.js"], {
  cwd: root,
  stdio: "inherit",
});
process.exit(copy.status ?? 1);
