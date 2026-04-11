import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const faviconPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/favicon.ico",
);

export function getFaviconPublicSrc(): string {
  try {
    return `/favicon.ico?v=${String(statSync(faviconPath).mtimeMs)}`;
  } catch {
    return "/favicon.ico";
  }
}
