declare const TrustedStaticHTMLBrand: unique symbol;
export type TrustedStaticHTML = string & { readonly [TrustedStaticHTMLBrand]: true };

export function trustedStaticHTML(html: string): TrustedStaticHTML {
  return html as TrustedStaticHTML;
}

export function setTrustedInnerHTML(el: Element, html: TrustedStaticHTML): void {
  // eslint-disable-next-line no-restricted-syntax -- single trusted sink; input is branded TrustedStaticHTML
  el.innerHTML = html;
}
