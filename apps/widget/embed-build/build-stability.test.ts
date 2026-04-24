import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const widgetRoot = join(__dirname, "..");
const artifactPath = join(widgetRoot, "dist-embed", "widget.iife.js.sri.json");

function runBuild(): void {
  const result = spawnSync("bun", ["run", "build:embed"], {
    cwd: widgetRoot,
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error(
      `build:embed failed (status ${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

function readArtifact(): { integrity: string; bytes: number } {
  return JSON.parse(readFileSync(artifactPath, "utf-8"));
}

describe("widget build stability", () => {
  it(
    "produces an identical SRI hash across two clean builds with unchanged source",
    { timeout: 60_000 },
    () => {
      runBuild();
      expect(existsSync(artifactPath)).toBe(true);
      const first = readArtifact();
      runBuild();
      const second = readArtifact();
      expect(second.integrity).toBe(first.integrity);
      expect(second.bytes).toBe(first.bytes);
      expect(first.integrity).toMatch(/^sha384-[A-Za-z0-9+/]+=*$/);
    },
  );
});
