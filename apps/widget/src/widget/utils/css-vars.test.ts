import { describe, expect, it } from "vitest";
import { applyCssVars } from "./css-vars.js";
import { defaultSettings } from "../constants/index.js";

describe("applyCssVars", () => {
  it("applies color variables to root element", () => {
    const root = document.createElement("div");
    applyCssVars(root, defaultSettings);

    expect(root.style.getPropertyValue("--dc-primary-color")).toBe(
      defaultSettings.colors.primary,
    );
    expect(root.style.getPropertyValue("--dc-background-color")).toBe(
      defaultSettings.colors.background,
    );
    expect(root.style.getPropertyValue("--dc-text-color")).toBe(
      defaultSettings.colors.text,
    );
  });

  it("applies font variables", () => {
    const root = document.createElement("div");
    applyCssVars(root, defaultSettings);

    expect(root.style.getPropertyValue("--dc-font-family")).toBe(
      defaultSettings.font.family,
    );
    expect(root.style.getPropertyValue("--dc-font-size")).toBe(
      defaultSettings.font.size,
    );
  });

  it("applies position and appearance variables", () => {
    const root = document.createElement("div");
    applyCssVars(root, defaultSettings);

    expect(root.style.getPropertyValue("--dc-position-corner")).toBe(
      defaultSettings.position.corner,
    );
    expect(root.style.getPropertyValue("--dc-border-radius")).toBe(
      defaultSettings.appearance.borderRadius,
    );
  });
});
