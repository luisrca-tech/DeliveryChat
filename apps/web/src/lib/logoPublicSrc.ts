import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const logoPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/logo.png",
);

export function getLogoPublicSrc(): string {
  try {
    return `/logo.png?v=${String(statSync(logoPath).mtimeMs)}`;
  } catch {
    return "/logo.png";
  }
}
