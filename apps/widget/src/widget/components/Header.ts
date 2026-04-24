import type { WidgetSettings } from "../types/index.js";
import { isValidLogoUrl } from "../utils/logo-url.js";
import { CLOSE_ICON } from "../constants/icons.js";

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
  // eslint-disable-next-line no-restricted-syntax -- static SVG icon constant
  closeBtn.innerHTML = CLOSE_ICON;
  if (onClose) {
    closeBtn.addEventListener("click", onClose);
  }
  header.appendChild(closeBtn);

  return header;
}
