import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

export interface SriArtifact {
  file: string;
  algorithm: "sha384";
  integrity: string;
  bytes: number;
}

export interface WriteSriArtifactOptions {
  bundlePath: string;
  outDir: string;
}

// Single source of truth for the SRI sidecar: hash algorithm, JSON shape,
// 2-space indent, trailing newline, and <basename>.sri.json filename all
// live here so docs and release scripts cannot drift from the build output.
export function writeSriArtifact(opts: WriteSriArtifactOptions): SriArtifact {
  const content = readFileSync(opts.bundlePath);
  const file = basename(opts.bundlePath);
  const artifact: SriArtifact = {
    file,
    algorithm: "sha384",
    integrity: `sha384-${createHash("sha384").update(content).digest("base64")}`,
    bytes: content.length,
  };
  writeFileSync(
    join(opts.outDir, `${file}.sri.json`),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  return artifact;
}
