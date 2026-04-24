import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { injectShadowStyles } from "./inject-styles.js";

class FakeStyleSheet {
  cssText = "";
  replaceSync(css: string): void {
    this.cssText = css;
  }
}

describe("injectShadowStyles", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    vi.unstubAllGlobals();
  });

  it("uses adoptedStyleSheets when Constructable Stylesheets are supported", () => {
    vi.stubGlobal("CSSStyleSheet", FakeStyleSheet);
    const shadow = host.attachShadow({ mode: "open" });
    Object.defineProperty(shadow, "adoptedStyleSheets", {
      value: [],
      writable: true,
      configurable: true,
    });

    const result = injectShadowStyles(shadow, ".x { color: red; }");

    expect(result).toBe("adopted");
    const adopted = (shadow as unknown as { adoptedStyleSheets: FakeStyleSheet[] })
      .adoptedStyleSheets;
    expect(adopted).toHaveLength(1);
    expect(adopted[0]?.cssText).toBe(".x { color: red; }");
    expect(shadow.querySelector("style")).toBeNull();
  });

  it("falls back to a <style> element when Constructable Stylesheets are unavailable", () => {
    vi.stubGlobal("CSSStyleSheet", undefined);
    const shadow = host.attachShadow({ mode: "open" });

    const result = injectShadowStyles(shadow, ".y { color: blue; }");

    expect(result).toBe("style-element");
    const styleEl = shadow.querySelector("style");
    expect(styleEl?.textContent).toBe(".y { color: blue; }");
  });
});
