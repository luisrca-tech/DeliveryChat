import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { injectShadowStyles } from "./inject-styles.js";

class FakeStyleSheet {
  cssText = "";
  replaceSync(css: string): void {
    this.cssText = css;
  }
}

function getAppliedCss(shadow: ShadowRoot): string | null {
  const adopted = (shadow as unknown as { adoptedStyleSheets?: FakeStyleSheet[] })
    .adoptedStyleSheets;
  if (adopted && adopted.length > 0) {
    return adopted.map((s) => s.cssText).join("\n");
  }
  const styleEl = shadow.querySelector("style");
  return styleEl?.textContent ?? null;
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

  it("applies the CSS to the shadow root when Constructable Stylesheets are supported", () => {
    vi.stubGlobal("CSSStyleSheet", FakeStyleSheet);
    const shadow = host.attachShadow({ mode: "open" });
    Object.defineProperty(shadow, "adoptedStyleSheets", {
      value: [],
      writable: true,
      configurable: true,
    });

    injectShadowStyles(shadow, ".x { color: red; }");

    expect(getAppliedCss(shadow)).toBe(".x { color: red; }");
  });

  it("applies the CSS to the shadow root when Constructable Stylesheets are unavailable", () => {
    vi.stubGlobal("CSSStyleSheet", undefined);
    const shadow = host.attachShadow({ mode: "open" });

    injectShadowStyles(shadow, ".y { color: blue; }");

    expect(getAppliedCss(shadow)).toBe(".y { color: blue; }");
  });
});
