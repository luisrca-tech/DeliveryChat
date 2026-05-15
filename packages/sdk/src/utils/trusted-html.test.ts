import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { trustedStaticHTML, setTrustedInnerHTML } from "./trusted-html.js";

describe("trusted-html", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it("setTrustedInnerHTML writes the branded HTML into the target element", () => {
    const svg = trustedStaticHTML("<svg aria-hidden='true'></svg>");

    setTrustedInnerHTML(host, svg);

    expect(host.querySelector("svg")).not.toBeNull();
    expect(host.innerHTML).toBe("<svg aria-hidden=\"true\"></svg>");
  });

  it("trustedStaticHTML preserves the original string contents", () => {
    const raw = "<circle cx='1'/>";
    const branded = trustedStaticHTML(raw);

    expect(String(branded)).toBe(raw);
  });
});
