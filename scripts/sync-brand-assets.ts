import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = join(root, "apps", "assets");

const FAVICON = "favicon.ico";
const LOGO = "logo.png";

const faviconDestinations = [
  join(root, "apps", "web", "public", FAVICON),
  join(root, "apps", "admin", "public", FAVICON),
  join(root, "apps", "widget", "public", FAVICON),
  join(root, "apps", "docs", "public", FAVICON),
  join(root, "apps", "hono-api", "public", FAVICON),
];

const logoDestinations = [
  join(root, "apps", "web", "public", LOGO),
  join(root, "apps", "admin", "public", LOGO),
  join(root, "apps", "hono-api", "public", LOGO),
];

function copyInto(
  label: string,
  sourceName: string,
  destinations: string[],
): void {
  const source = join(assetsDir, sourceName);
  if (!existsSync(source)) {
    console.error(`sync:assets: missing source ${source}`);
    process.exit(1);
  }
  for (const dest of destinations) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(source, dest);
    console.log(`${label} -> ${dest.slice(root.length + 1)}`);
  }
}

copyInto("favicon", FAVICON, faviconDestinations);
copyInto("logo", LOGO, logoDestinations);
console.log("sync:assets done.");
