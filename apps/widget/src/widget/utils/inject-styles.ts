/**
 * Injects CSS into a shadow root using Constructable Stylesheets so that a
 * strict host-page CSP (no `style-src 'unsafe-inline'`) is not required.
 *
 * Falls back to a `<style>` element only in environments without
 * Constructable Stylesheets support (e.g. legacy test environments).
 */
export function injectShadowStyles(shadow: ShadowRoot, css: string): void {
  const w = (typeof window !== "undefined" ? window : undefined) as
    | (Window & { CSSStyleSheet?: typeof CSSStyleSheet })
    | undefined;
  const SheetCtor = w?.CSSStyleSheet;
  const supportsAdopted =
    typeof SheetCtor === "function" &&
    "replaceSync" in SheetCtor.prototype &&
    "adoptedStyleSheets" in shadow;

  if (supportsAdopted) {
    const sheet = new SheetCtor!();
    (sheet as CSSStyleSheet & { replaceSync: (css: string) => void }).replaceSync(css);
    (shadow as ShadowRoot & { adoptedStyleSheets: CSSStyleSheet[] }).adoptedStyleSheets = [sheet];
    return;
  }

  const style = document.createElement("style");
  style.textContent = css;
  shadow.appendChild(style);
}
