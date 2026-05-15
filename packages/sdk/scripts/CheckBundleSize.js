import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IIFE_MAX_BYTES = 75_000;

const sriPath = resolve(
  __dirname,
  "../../../apps/widget/dist-embed/widget.iife.js.sri.json",
);

let sri;
try {
  sri = JSON.parse(readFileSync(sriPath, "utf-8"));
} catch {
  console.error(
    `[bundle-size] Could not read SRI artifact at ${sriPath}. Run the widget embed build first.`,
  );
  process.exit(1);
}

const bytes = sri.bytes;
const kb = (bytes / 1024).toFixed(2);

if (bytes > IIFE_MAX_BYTES) {
  console.error(
    `[bundle-size] FAIL: widget.iife.js is ${kb} kB (${bytes} bytes), exceeds ${IIFE_MAX_BYTES} byte limit`,
  );
  process.exit(1);
}

console.log(
  `[bundle-size] OK: widget.iife.js is ${kb} kB (${bytes}/${IIFE_MAX_BYTES} bytes)`,
);
