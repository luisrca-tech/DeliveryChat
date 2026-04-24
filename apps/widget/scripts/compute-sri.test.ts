import { describe, it, expect } from "vitest";
import { computeSriHash, formatSriArtifact } from "./compute-sri";

describe("computeSriHash", () => {
  it("produces a sha384 SRI hash for empty input", () => {
    const hash = computeSriHash(Buffer.from(""));
    expect(hash).toBe(
      "sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb",
    );
  });

  it("produces a deterministic sha384 SRI hash for known content", () => {
    const hash = computeSriHash(Buffer.from("hello world"));
    expect(hash).toMatch(/^sha384-[A-Za-z0-9+/]+=*$/);
    expect(hash).toBe(computeSriHash(Buffer.from("hello world")));
  });

  it("produces different hashes for different content", () => {
    const a = computeSriHash(Buffer.from("a"));
    const b = computeSriHash(Buffer.from("b"));
    expect(a).not.toBe(b);
  });
});

describe("formatSriArtifact", () => {
  it("emits an artifact with file name, size, hash, and algorithm", () => {
    const artifact = formatSriArtifact({
      file: "widget.iife.js",
      content: Buffer.from("hello world"),
    });
    expect(artifact).toEqual({
      file: "widget.iife.js",
      algorithm: "sha384",
      integrity: computeSriHash(Buffer.from("hello world")),
      bytes: 11,
    });
  });
});
