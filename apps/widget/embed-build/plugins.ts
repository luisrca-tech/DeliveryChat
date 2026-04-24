import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";
import { writeSriArtifact } from "./sri-artifact";

// Both plugins run in `writeBundle`, which Rollup fires after every chunk is
// on disk. Within a single plugin array Vite runs hooks in registration
// order, so `emitSriArtifact` runs before `copyWidgetToPublic`. The SRI
// sidecar is written next to the bundle in `outDir`; the copy step only
// mirrors the bundle itself to `publicDir`, so ordering is not load-bearing
// today — but the emitter runs first by convention so the sidecar is
// observable to any follow-up plugin.

export function emitSriArtifact(outDir: string): Plugin {
  return {
    name: "emit-sri-artifact",
    writeBundle() {
      const artifact = writeSriArtifact({
        bundlePath: join(outDir, "widget.iife.js"),
        outDir,
      });
      console.log(`[embed] emitted SRI artifact: ${artifact.integrity}`);
    },
  };
}

export function copyWidgetToPublic(outDir: string, publicDir: string): Plugin {
  return {
    name: "copy-widget-to-public",
    writeBundle() {
      const src = join(outDir, "widget.iife.js");
      const dest = join(publicDir, "widget.js");
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      console.log("[embed] copied to public/widget.js");
    },
  };
}
