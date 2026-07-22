import { describe, expect, it, vi } from "vitest";
import { createHumanHandoffButton } from "./HumanHandoffButton.js";

describe("HumanHandoffButton", () => {
  it("renders hidden by default", () => {
    const button = createHumanHandoffButton(() => {});
    expect(button.hidden).toBe(true);
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("aria-label")).toBe("Talk to a human");
  });

  it("calls the provided callback on click", () => {
    const onClick = vi.fn();
    const button = createHumanHandoffButton(onClick);

    button.hidden = false;
    button.click();

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("can be shown and disabled by the caller", () => {
    const button = createHumanHandoffButton(() => {});
    button.hidden = false;
    button.disabled = true;

    expect(button.hidden).toBe(false);
    expect(button.disabled).toBe(true);
  });
});
