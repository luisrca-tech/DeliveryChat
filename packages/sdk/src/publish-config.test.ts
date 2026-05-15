import { describe, expect, it } from "vitest";

import pkg from "../package.json";

describe("SDK package.json publish config", () => {
  it("has version 1.0.0", () => {
    expect(pkg.version).toBe("1.0.0");
  });

  it("has prepublishOnly script that runs build", () => {
    expect(pkg.scripts.prepublishOnly).toBe("bun run build");
  });

  it("restricts published files to dist/", () => {
    expect(pkg.files).toEqual(["dist"]);
  });

  it("has public publish access", () => {
    expect(pkg.publishConfig.access).toBe("public");
  });
});
