import { isValidLauncherImageUrl } from "../utils/logo-url.js";

const ICONS: Record<"chat" | "question" | "message", string> = {
  chat: `<path d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12zm10-8a8 8 0 100 16 8 8 0 000-16z"/><path d="M8 12a1 1 0 011-1h4a1 1 0 110 2H9a1 1 0 01-1-1z"/>`,
  question: `<path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"/>`,
  message: `<path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"/>`,
};

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
  const path = ICONS[icon];
  const svgAttrs =
    icon === "chat"
      ? 'fill="currentColor"'
      : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ${svgAttrs} aria-hidden="true">${path}</svg>`;
  btn.appendChild(createBadge());

  return btn;
}
