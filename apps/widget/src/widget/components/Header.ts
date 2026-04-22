import type { WidgetSettings } from "../types.js";
import { isValidLogoUrl } from "../utils/logo-url.js";

export function createHeader(
  settings: WidgetSettings["header"],
  onClose?: () => void,
): HTMLElement {
  const header = document.createElement("div");
  header.className = "header";

  if (settings.showLogo && isValidLogoUrl(settings.logoUrl)) {
    const img = document.createElement("img");
    img.className = "header-logo";
    img.alt = "";
    img.setAttribute("src", settings.logoUrl!.trim());
    header.appendChild(img);
  }

  const textDiv = document.createElement("div");
  textDiv.className = "header-text";
  const titleEl = document.createElement("div");
  titleEl.className = "header-title";
  titleEl.textContent = settings.title;
  const subtitleEl = document.createElement("div");
  subtitleEl.className = "header-subtitle";
  subtitleEl.textContent = settings.subtitle;
  textDiv.appendChild(titleEl);
  textDiv.appendChild(subtitleEl);
  header.appendChild(textDiv);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "header-close";
  closeBtn.setAttribute("aria-label", "Close chat");
  // eslint-disable-next-line no-restricted-syntax -- static SVG icon literal
  closeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
  if (onClose) {
    closeBtn.addEventListener("click", onClose);
  }
  header.appendChild(closeBtn);

  return header;
}
