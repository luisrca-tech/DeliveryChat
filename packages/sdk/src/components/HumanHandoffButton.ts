import { setTrustedInnerHTML } from "../utils/trusted-html.js";
import { HUMAN_ICON } from "../constants/icons.js";

/**
 * Persistent "Talk to a human" escalation trigger (plan §8, AC #4). Lives in
 * the header — the one chrome element visible regardless of scroll position
 * or conversation state — so it reads as an always-available control rather
 * than something tucked away in the message flow.
 *
 * Visibility/disabled state is driven externally (see widget.ts) from
 * conversation + escalation state; this component only renders the control
 * and wires the click.
 */
export function createHumanHandoffButton(
  onClick: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "human-handoff-btn";
  button.setAttribute("aria-label", "Talk to a human");
  button.title = "Talk to a human";
  button.hidden = true;
  setTrustedInnerHTML(button, HUMAN_ICON);

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });

  return button;
}
