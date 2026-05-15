import type { WidgetSettings } from "../types/index.js";

const VAR_PREFIX = "--dc-";

export function applyCssVars(root: HTMLElement, settings: WidgetSettings): void {
  const { colors, font, position, appearance } = settings;

  root.style.setProperty(`${VAR_PREFIX}primary-color`, colors.primary);
  root.style.setProperty(`${VAR_PREFIX}background-color`, colors.background);
  root.style.setProperty(`${VAR_PREFIX}text-color`, colors.text);
  root.style.setProperty(`${VAR_PREFIX}text-secondary-color`, colors.textSecondary);
  root.style.setProperty(`${VAR_PREFIX}user-bubble`, colors.userBubble);
  root.style.setProperty(`${VAR_PREFIX}visitor-bubble`, colors.visitorBubble);

  root.style.setProperty(`${VAR_PREFIX}font-family`, font.family);
  root.style.setProperty(`${VAR_PREFIX}font-size`, font.size);

  root.style.setProperty(`${VAR_PREFIX}position-corner`, position.corner);
  root.style.setProperty(`${VAR_PREFIX}position-offset`, position.offset);

  root.style.setProperty(`${VAR_PREFIX}border-radius`, appearance.borderRadius);
  root.style.setProperty(`${VAR_PREFIX}shadow`, appearance.shadow);
  root.style.setProperty(`${VAR_PREFIX}width`, appearance.width);
  root.style.setProperty(`${VAR_PREFIX}height`, appearance.height);
}
