import { isValidLauncherImageUrl } from "../utils/logo-url.js";
import { setTrustedInnerHTML } from "../utils/trusted-html.js";
import { ICON_SVGS } from "../constants/icons.js";

function createBadge(): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = "launcher-badge";
  badge.hidden = true;
  badge.setAttribute("aria-live", "polite");
  return badge;
}

export function createLauncher(settings: {
  corner: string;
  label: string;
  icon?: "chat" | "question" | "message";
  logoUrl?: string;
}): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.setAttribute("aria-label", settings.label);
  btn.setAttribute("aria-expanded", "false");
  btn.className = "launcher";
  btn.type = "button";

  if (isValidLauncherImageUrl(settings.logoUrl)) {
    const img = document.createElement("img");
    img.src = settings.logoUrl!.trim();
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.className = "launcher-logo";
    btn.appendChild(img);
    btn.appendChild(createBadge());
    return btn;
  }

  const icon = settings.icon ?? "chat";
  setTrustedInnerHTML(btn, ICON_SVGS[icon]);
  btn.appendChild(createBadge());

  return btn;
}
