import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeSriArtifact } from "./sri-artifact";

describe("writeSriArtifact", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "sri-artifact-"));
  });

  it("writes <basename>.sri.json next to the bundle with sha384 integrity", () => {
    const bundle = join(dir, "widget.iife.js");
    writeFileSync(bundle, "hello world");

    const artifact = writeSriArtifact({ bundlePath: bundle, outDir: dir });

    expect(artifact).toEqual({
      file: "widget.iife.js",
      algorithm: "sha384",
      integrity: expect.stringMatching(/^sha384-[A-Za-z0-9+/]+=*$/),
      bytes: 11,
    });

    const written = readFileSync(
      join(dir, "widget.iife.js.sri.json"),
      "utf-8",
    );
    expect(written.endsWith("\n")).toBe(true);
    expect(JSON.parse(written)).toEqual(artifact);
    expect(written).toBe(`${JSON.stringify(artifact, null, 2)}\n`);
  });

  it("computes the canonical sha384 digest for empty content", () => {
    const bundle = join(dir, "empty.js");
    writeFileSync(bundle, "");

    const artifact = writeSriArtifact({ bundlePath: bundle, outDir: dir });

    expect(artifact.integrity).toBe(
      "sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb",
    );
    expect(artifact.bytes).toBe(0);
  });

  it("produces identical artifacts for identical content (determinism)", () => {
    const a = join(dir, "a.js");
    const b = join(dir, "b.js");
    writeFileSync(a, "same bytes");
    writeFileSync(b, "same bytes");

    const one = writeSriArtifact({ bundlePath: a, outDir: dir });
    const two = writeSriArtifact({ bundlePath: b, outDir: dir });

    expect(one.integrity).toBe(two.integrity);
    expect(one.bytes).toBe(two.bytes);
  });

  it("produces different integrity for different content", () => {
    const a = join(dir, "a.js");
    const b = join(dir, "b.js");
    writeFileSync(a, "x");
    writeFileSync(b, "y");

    const one = writeSriArtifact({ bundlePath: a, outDir: dir });
    const two = writeSriArtifact({ bundlePath: b, outDir: dir });

    expect(one.integrity).not.toBe(two.integrity);
  });

  it("derives the artifact `file` from the bundle basename", () => {
    const bundle = join(dir, "custom-name.iife.js");
    writeFileSync(bundle, "contents");

    const artifact = writeSriArtifact({ bundlePath: bundle, outDir: dir });

    expect(artifact.file).toBe("custom-name.iife.js");
    const written = readFileSync(
      join(dir, "custom-name.iife.js.sri.json"),
      "utf-8",
    );
    expect(JSON.parse(written).file).toBe("custom-name.iife.js");
  });
});
